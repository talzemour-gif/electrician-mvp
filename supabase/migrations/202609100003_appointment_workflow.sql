-- Track recent customer activity and appointment reschedules.
alter table public.customers add column updated_at timestamptz not null default now();

create or replace function public.set_customer_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger customers_set_updated_at before update on public.customers
for each row execute function public.set_customer_updated_at();

create or replace function public.touch_related_customer()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  update public.customers set updated_at = now()
  where id = coalesce(new.customer_id, old.customer_id);
  return coalesce(new, old);
end $$;
create trigger addresses_touch_customer after insert or update or delete on public.customer_addresses
for each row execute function public.touch_related_customer();

create or replace function public.track_appointment_change()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  if new.starts_at is distinct from old.starts_at then
    new.reschedule_count := old.reschedule_count + 1;
    insert into public.appointment_reschedules(appointment_id, old_starts_at, new_starts_at)
    values (old.id, old.starts_at, new.starts_at);
  end if;
  return new;
end $$;
create trigger appointments_track_change before update on public.appointments
for each row execute function public.track_appointment_change();

create trigger appointments_touch_customer after insert or update or delete on public.appointments
for each row execute function public.touch_related_customer();
