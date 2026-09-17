-- Remove pre-tenant foreign keys that duplicate the organization-aware relationships.
-- Keeping both makes PostgREST embedded-resource queries ambiguous, even for empty tenants.
begin;

alter table public.customer_addresses
  drop constraint if exists customer_addresses_customer_id_fkey;
alter table public.appointments
  drop constraint if exists appointments_customer_id_fkey;
alter table public.appointments
  drop constraint if exists appointments_job_type_id_fkey;
alter table public.appointment_reschedules
  drop constraint if exists appointment_reschedules_appointment_id_fkey;

commit;
