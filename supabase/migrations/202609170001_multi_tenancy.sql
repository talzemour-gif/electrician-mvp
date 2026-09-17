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
