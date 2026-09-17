-- Initial schema for a new Supabase project. Apply once.
begin;

create extension if not exists pgcrypto;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(btrim(full_name)) > 0),
  phone text not null check (length(btrim(phone)) > 0),
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customers_name_idx on public.customers using gin (to_tsvector('simple', full_name));
create index customers_phone_idx on public.customers(phone);

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  label text not null check (length(btrim(label)) > 0),
  address text not null check (length(btrim(address)) > 0),
  city text,
  latitude double precision,
  longitude double precision,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  constraint address_coordinates_together check ((latitude is null and longitude is null) or (latitude is not null and longitude is not null and latitude between -90 and 90 and longitude between -180 and 180))
);

create table public.job_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) > 0),
  default_price numeric(10,2) not null check (default_price >= 0),
  default_duration_minutes integer not null check (default_duration_minutes > 0),
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create type public.appointment_status as enum ('scheduled','completed','cancelled');

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  customer_address_id uuid,
  job_type_id uuid references public.job_types(id),
  starts_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes > 0),
  price numeric(10,2) not null check (price >= 0),
  status public.appointment_status not null default 'scheduled',
  cancellation_reason text,
  reschedule_count integer not null default 0 check (reschedule_count >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.availability_blocks (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_available boolean not null default true,
  note text,
  constraint availability_time_check check (ends_at > starts_at)
);

-- נשמור גם היסטוריית הזזות, כדי שבעתיד לא נסתפק רק במונה.
create table public.appointment_reschedules (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  old_starts_at timestamptz not null,
  new_starts_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now()
);

-- Keep each appointment's address tied to its customer.
alter table public.customer_addresses add constraint address_customer_unique unique (id, customer_id);
alter table public.appointments add constraint appointment_address_customer_fk
  foreign key (customer_address_id, customer_id) references public.customer_addresses(id, customer_id);
create index customer_addresses_customer_idx on public.customer_addresses(customer_id);
create unique index customer_one_default_address on public.customer_addresses(customer_id) where is_default;
create index appointments_customer_idx on public.appointments(customer_id);
create index appointments_starts_at_idx on public.appointments(starts_at);

-- One business for this MVP. Membership is assigned only by the project administrator.
create table public.app_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  created_at timestamptz not null default now()
);
alter table public.app_members enable row level security;
revoke all on public.app_members from anon, authenticated;
grant select on public.app_members to authenticated;
create policy read_own_membership on public.app_members for select to authenticated
  using (user_id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['customers','customer_addresses','job_types','appointments','availability_blocks','appointment_reschedules'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy member_select on public.%I for select to authenticated using (exists (select 1 from public.app_members where user_id = (select auth.uid())))', t);
    execute format('create policy member_insert on public.%I for insert to authenticated with check (exists (select 1 from public.app_members where user_id = (select auth.uid())))', t);
    execute format('create policy member_update on public.%I for update to authenticated using (exists (select 1 from public.app_members where user_id = (select auth.uid()))) with check (exists (select 1 from public.app_members where user_id = (select auth.uid())))', t);
    execute format('create policy admin_delete on public.%I for delete to authenticated using (exists (select 1 from public.app_members where user_id = (select auth.uid()) and role = ''admin''))', t);
  end loop;
end $$;

-- Runs under the caller's permissions; both inserts succeed or neither does.
create function public.create_customer(
  p_name text, p_phone text, p_city text default '', p_label text default 'בית',
  p_address text default '', p_notes text default ''
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare new_id uuid;
begin
  if length(btrim(coalesce(p_city, ''))) > 0 and length(btrim(coalesce(p_address, ''))) = 0 then
    raise exception 'An address is required when a city is provided' using errcode = '23514';
  end if;
  insert into public.customers(full_name, phone, notes)
    values (btrim(p_name), btrim(p_phone), nullif(btrim(p_notes), '')) returning id into new_id;
  if length(btrim(coalesce(p_address, ''))) > 0 then
    insert into public.customer_addresses(customer_id, label, address, city, is_default)
      values (new_id, btrim(p_label), btrim(p_address), nullif(btrim(p_city), ''), true);
  end if;
  return new_id;
end $$;
revoke all on function public.create_customer(text,text,text,text,text,text) from public, anon;
grant execute on function public.create_customer(text,text,text,text,text,text) to authenticated;

-- Save a customer and any number of initial addresses in one transaction.
create function public.create_customer_with_addresses(
  p_name text, p_phone text, p_notes text default '', p_addresses jsonb default '[]'::jsonb
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare new_id uuid; item jsonb; item_label text; item_address text; item_city text; item_latitude double precision; item_longitude double precision; item_index integer := 0;
begin
  if jsonb_typeof(coalesce(p_addresses, '[]'::jsonb)) <> 'array' then
    raise exception 'Addresses must be an array' using errcode = '22023';
  end if;
  insert into public.customers(full_name, phone, notes)
    values (btrim(p_name), btrim(p_phone), nullif(btrim(p_notes), '')) returning id into new_id;
  for item in select value from jsonb_array_elements(coalesce(p_addresses, '[]'::jsonb)) loop
    item_label := coalesce(nullif(btrim(item->>'label'), ''), 'כתובת');
    item_address := btrim(coalesce(item->>'address', ''));
    item_city := btrim(coalesce(item->>'city', ''));
    item_latitude := (item->>'latitude')::double precision;
    item_longitude := (item->>'longitude')::double precision;
    if item_address = '' or item_city = '' then
      raise exception 'Each address requires an address and city' using errcode = '23514';
    end if;
    if item_latitude is null or item_longitude is null then
      raise exception 'Each address requires verified coordinates' using errcode = '23514';
    end if;
    insert into public.customer_addresses(customer_id, label, address, city, latitude, longitude, is_default)
      values (new_id, item_label, item_address, item_city, item_latitude, item_longitude, item_index = 0);
    item_index := item_index + 1;
  end loop;
  return new_id;
end $$;
revoke all on function public.create_customer_with_addresses(text,text,text,jsonb) from public, anon;
grant execute on function public.create_customer_with_addresses(text,text,text,jsonb) to authenticated;

create function public.set_customer_updated_at() returns trigger language plpgsql security invoker set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger customers_set_updated_at before update on public.customers for each row execute function public.set_customer_updated_at();

create function public.touch_related_customer() returns trigger language plpgsql security invoker set search_path = '' as $$
begin update public.customers set updated_at = now() where id = coalesce(new.customer_id, old.customer_id); return coalesce(new, old); end $$;
create trigger addresses_touch_customer after insert or update or delete on public.customer_addresses for each row execute function public.touch_related_customer();

create function public.track_appointment_change() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  if new.starts_at is distinct from old.starts_at then
    new.reschedule_count := old.reschedule_count + 1;
    insert into public.appointment_reschedules(appointment_id, old_starts_at, new_starts_at) values(old.id, old.starts_at, new.starts_at);
  end if;
  return new;
end $$;
create trigger appointments_track_change before update on public.appointments for each row execute function public.track_appointment_change();
create trigger appointments_touch_customer after insert or update or delete on public.appointments for each row execute function public.touch_related_customer();

insert into public.job_types(name, default_price, default_duration_minutes) values
  ('בדיקת מתקן',650,90), ('בדיקת לוח',500,60), ('בדיקה תקופתית',800,120);
commit;
-- Add organization ownership and database-enforced tenant isolation.
begin;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  profession text,
  timezone text not null default 'Asia/Jerusalem',
  created_at timestamptz not null default now()
);

insert into public.organizations(id, name, profession)
values ('00000000-0000-4000-8000-000000000001', 'עסק בדיקות החשמל', 'בדיקות חשמל')
on conflict (id) do nothing;

alter table public.app_members rename to organization_members;
alter table public.organization_members add column organization_id uuid;
update public.organization_members
set organization_id = '00000000-0000-4000-8000-000000000001'
where organization_id is null;
alter table public.organization_members alter column organization_id set not null;
alter table public.organization_members add constraint organization_members_organization_fk
  foreign key (organization_id) references public.organizations(id) on delete cascade;
create index organization_members_organization_idx on public.organization_members(organization_id);

create function public.current_organization_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select organization_id
  from public.organization_members
  where user_id = (select auth.uid())
$$;
revoke all on function public.current_organization_id() from public, anon;
grant execute on function public.current_organization_id() to authenticated;

alter table public.customers add column organization_id uuid;
alter table public.customer_addresses add column organization_id uuid;
alter table public.job_types add column organization_id uuid;
alter table public.appointments add column organization_id uuid;
alter table public.availability_blocks add column organization_id uuid;
alter table public.appointment_reschedules add column organization_id uuid;

update public.customers set organization_id = '00000000-0000-4000-8000-000000000001';
update public.customer_addresses set organization_id = '00000000-0000-4000-8000-000000000001';
update public.job_types set organization_id = '00000000-0000-4000-8000-000000000001';
update public.appointments set organization_id = '00000000-0000-4000-8000-000000000001';
update public.availability_blocks set organization_id = '00000000-0000-4000-8000-000000000001';
update public.appointment_reschedules set organization_id = '00000000-0000-4000-8000-000000000001';

do $$
declare t text;
begin
  foreach t in array array['customers','customer_addresses','job_types','appointments','availability_blocks','appointment_reschedules'] loop
    execute format('alter table public.%I alter column organization_id set not null', t);
    execute format('alter table public.%I alter column organization_id set default public.current_organization_id()', t);
    execute format('alter table public.%I add constraint %I foreign key (organization_id) references public.organizations(id)', t, t || '_organization_fk');
  end loop;
end $$;

alter table public.job_types drop constraint job_types_name_key;
alter table public.job_types add constraint job_types_organization_name_unique unique (organization_id, name);
alter table public.customers add constraint customers_id_organization_unique unique (id, organization_id);
alter table public.job_types add constraint job_types_id_organization_unique unique (id, organization_id);
alter table public.appointments drop constraint appointment_address_customer_fk;
alter table public.customer_addresses drop constraint address_customer_unique;
alter table public.customer_addresses add constraint address_customer_organization_unique unique (id, customer_id, organization_id);
alter table public.customer_addresses add constraint address_customer_organization_fk
  foreign key (customer_id, organization_id) references public.customers(id, organization_id) on delete cascade;
alter table public.appointments add constraint appointments_id_organization_unique unique (id, organization_id);
alter table public.appointments add constraint appointment_customer_organization_fk
  foreign key (customer_id, organization_id) references public.customers(id, organization_id);
alter table public.appointments add constraint appointment_job_organization_fk
  foreign key (job_type_id, organization_id) references public.job_types(id, organization_id);
alter table public.appointments add constraint appointment_address_customer_organization_fk
  foreign key (customer_address_id, customer_id, organization_id)
  references public.customer_addresses(id, customer_id, organization_id);
alter table public.appointment_reschedules add constraint reschedule_appointment_organization_fk
  foreign key (appointment_id, organization_id) references public.appointments(id, organization_id) on delete cascade;

-- The organization-aware foreign keys above replace the original single-column
-- relationships. Removing the originals also keeps PostgREST embeds unambiguous.
alter table public.customer_addresses drop constraint customer_addresses_customer_id_fkey;
alter table public.appointments drop constraint appointments_customer_id_fkey;
alter table public.appointments drop constraint appointments_job_type_id_fkey;
alter table public.appointment_reschedules drop constraint appointment_reschedules_appointment_id_fkey;

create index customers_organization_idx on public.customers(organization_id);
create index customer_addresses_organization_idx on public.customer_addresses(organization_id);
create index job_types_organization_idx on public.job_types(organization_id);
create index appointments_organization_starts_idx on public.appointments(organization_id, starts_at);
create index availability_blocks_organization_idx on public.availability_blocks(organization_id);
create index appointment_reschedules_organization_idx on public.appointment_reschedules(organization_id);

alter table public.organizations enable row level security;
revoke all on public.organizations from anon, authenticated;
grant select on public.organizations to authenticated;
create policy member_select_organization on public.organizations for select to authenticated
  using (id = (select public.current_organization_id()));

drop policy if exists read_own_membership on public.organization_members;
create policy read_own_membership on public.organization_members for select to authenticated
  using (user_id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['customers','customer_addresses','job_types','appointments','availability_blocks','appointment_reschedules'] loop
    execute format('drop policy if exists staff_access on public.%I', t);
    execute format('drop policy if exists member_select on public.%I', t);
    execute format('drop policy if exists member_insert on public.%I', t);
    execute format('drop policy if exists member_update on public.%I', t);
    execute format('drop policy if exists admin_delete on public.%I', t);
    execute format('create policy tenant_select on public.%I for select to authenticated using (organization_id = (select public.current_organization_id()))', t);
    execute format('create policy tenant_insert on public.%I for insert to authenticated with check (organization_id = (select public.current_organization_id()))', t);
    execute format('create policy tenant_update on public.%I for update to authenticated using (organization_id = (select public.current_organization_id())) with check (organization_id = (select public.current_organization_id()))', t);
    execute format('create policy tenant_admin_delete on public.%I for delete to authenticated using (organization_id = (select public.current_organization_id()) and exists (select 1 from public.organization_members where user_id = (select auth.uid()) and organization_id = public.current_organization_id() and role = ''admin''))', t);
  end loop;
end $$;

create or replace function public.create_customer(
  p_name text, p_phone text, p_city text default '', p_label text default 'בית',
  p_address text default '', p_notes text default ''
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare new_id uuid; tenant_id uuid := public.current_organization_id();
begin
  if tenant_id is null then raise exception 'Organization membership is required' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_city, ''))) > 0 and length(btrim(coalesce(p_address, ''))) = 0 then
    raise exception 'An address is required when a city is provided' using errcode = '23514';
  end if;
  insert into public.customers(organization_id, full_name, phone, notes)
    values (tenant_id, btrim(p_name), btrim(p_phone), nullif(btrim(p_notes), '')) returning id into new_id;
  if length(btrim(coalesce(p_address, ''))) > 0 then
    insert into public.customer_addresses(organization_id, customer_id, label, address, city, is_default)
      values (tenant_id, new_id, btrim(p_label), btrim(p_address), nullif(btrim(p_city), ''), true);
  end if;
  return new_id;
end $$;

create or replace function public.create_customer_with_addresses(
  p_name text, p_phone text, p_notes text default '', p_addresses jsonb default '[]'::jsonb
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare new_id uuid; tenant_id uuid := public.current_organization_id(); item jsonb; item_label text; item_address text; item_city text; item_latitude double precision; item_longitude double precision; item_index integer := 0;
begin
  if tenant_id is null then raise exception 'Organization membership is required' using errcode = '42501'; end if;
  if jsonb_typeof(coalesce(p_addresses, '[]'::jsonb)) <> 'array' then
    raise exception 'Addresses must be an array' using errcode = '22023';
  end if;
  insert into public.customers(organization_id, full_name, phone, notes)
    values (tenant_id, btrim(p_name), btrim(p_phone), nullif(btrim(p_notes), '')) returning id into new_id;
  for item in select value from jsonb_array_elements(coalesce(p_addresses, '[]'::jsonb)) loop
    item_label := coalesce(nullif(btrim(item->>'label'), ''), 'כתובת');
    item_address := btrim(coalesce(item->>'address', ''));
    item_city := btrim(coalesce(item->>'city', ''));
    item_latitude := (item->>'latitude')::double precision;
    item_longitude := (item->>'longitude')::double precision;
    if item_address = '' or item_city = '' then raise exception 'Each address requires an address and city' using errcode = '23514'; end if;
    if item_latitude is null or item_longitude is null then raise exception 'Each address requires verified coordinates' using errcode = '23514'; end if;
    insert into public.customer_addresses(organization_id, customer_id, label, address, city, latitude, longitude, is_default)
      values (tenant_id, new_id, item_label, item_address, item_city, item_latitude, item_longitude, item_index = 0);
    item_index := item_index + 1;
  end loop;
  return new_id;
end $$;

create or replace function public.touch_related_customer() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  update public.customers set updated_at = now()
  where id = coalesce(new.customer_id, old.customer_id)
    and organization_id = coalesce(new.organization_id, old.organization_id);
  return coalesce(new, old);
end $$;

create or replace function public.track_appointment_change() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  if new.starts_at is distinct from old.starts_at then
    new.reschedule_count := old.reschedule_count + 1;
    insert into public.appointment_reschedules(organization_id, appointment_id, old_starts_at, new_starts_at)
    values(old.organization_id, old.id, old.starts_at, new.starts_at);
  end if;
  return new;
end $$;

commit;
