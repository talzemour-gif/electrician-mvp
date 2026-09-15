-- Initial schema for a new Supabase project. Apply once.
begin;

create extension if not exists pgcrypto;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(btrim(full_name)) > 0),
  phone text not null check (length(btrim(phone)) > 0),
  email text,
  notes text,
  created_at timestamptz not null default now()
);

create index customers_name_idx on public.customers using gin (to_tsvector('simple', full_name));
create index customers_phone_idx on public.customers(phone);

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  label text not null check (length(btrim(label)) > 0),
  address text not null check (length(btrim(address)) > 0),
  city text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
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
    execute format('create policy staff_access on public.%I for all to authenticated using (exists (select 1 from public.app_members where user_id = (select auth.uid()))) with check (exists (select 1 from public.app_members where user_id = (select auth.uid())))', t);
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

insert into public.job_types(name, default_price, default_duration_minutes) values
  ('בדיקת מתקן',650,90), ('בדיקת לוח',500,60), ('בדיקה תקופתית',800,120);
commit;
