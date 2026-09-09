create extension if not exists pgcrypto;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  email text,
  notes text,
  created_at timestamptz not null default now()
);

create index customers_name_idx on public.customers using gin (to_tsvector('simple', full_name));
create index customers_phone_idx on public.customers(phone);

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  label text not null,
  address text not null,
  city text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.job_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
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
  customer_address_id uuid references public.customer_addresses(id),
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
