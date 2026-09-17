-- Appointment execution workflow and timestamped multi-note timeline.
begin;

alter type public.appointment_status add value if not exists 'in_progress' after 'scheduled';

alter table public.appointments
  add column started_at timestamptz,
  add column completed_at timestamptz;

create type public.appointment_note_type as enum ('research', 'meeting_summary');

create table public.appointment_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_organization_id()
    references public.organizations(id),
  appointment_id uuid not null,
  note_type public.appointment_note_type not null,
  body text not null check (length(btrim(body)) > 0),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  constraint appointment_notes_appointment_organization_fk
    foreign key (appointment_id, organization_id)
    references public.appointments(id, organization_id) on delete cascade
);

create index appointment_notes_appointment_created_idx
  on public.appointment_notes(appointment_id, created_at);
create index appointment_notes_organization_idx
  on public.appointment_notes(organization_id);

alter table public.appointment_notes enable row level security;
revoke all on public.appointment_notes from anon, authenticated;
grant select, insert, update, delete on public.appointment_notes to authenticated;
create policy tenant_select on public.appointment_notes for select to authenticated
  using (organization_id = (select public.current_organization_id()));
create policy tenant_insert on public.appointment_notes for insert to authenticated
  with check (organization_id = (select public.current_organization_id()));
create policy tenant_update on public.appointment_notes for update to authenticated
  using (organization_id = (select public.current_organization_id()))
  with check (organization_id = (select public.current_organization_id()));
create policy tenant_admin_delete on public.appointment_notes for delete to authenticated
  using (
    organization_id = (select public.current_organization_id())
    and exists (
      select 1 from public.organization_members
      where user_id = (select auth.uid())
        and organization_id = public.current_organization_id()
        and role = 'admin'
    )
  );

commit;
