-- Mixed-content appointment notes and private tenant-scoped file storage.
begin;

alter table public.appointment_notes
  alter column body drop not null,
  drop constraint if exists appointment_notes_body_check,
  add column use_in_final_report boolean not null default false,
  add constraint appointment_notes_id_organization_unique unique (id, organization_id);

create table public.appointment_note_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_organization_id()
    references public.organizations(id),
  note_id uuid not null,
  storage_path text not null unique check (length(btrim(storage_path)) > 0),
  file_name text not null check (length(btrim(file_name)) > 0),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  created_at timestamptz not null default now(),
  constraint note_attachments_note_organization_fk
    foreign key (note_id, organization_id)
    references public.appointment_notes(id, organization_id) on delete cascade
);

create index note_attachments_note_idx on public.appointment_note_attachments(note_id, created_at);
create index note_attachments_organization_idx on public.appointment_note_attachments(organization_id);

alter table public.appointment_note_attachments enable row level security;
revoke all on public.appointment_note_attachments from anon, authenticated;
grant select, insert, update, delete on public.appointment_note_attachments to authenticated;
create policy tenant_select on public.appointment_note_attachments for select to authenticated
  using (organization_id = (select public.current_organization_id()));
create policy tenant_insert on public.appointment_note_attachments for insert to authenticated
  with check (organization_id = (select public.current_organization_id()));
create policy tenant_update on public.appointment_note_attachments for update to authenticated
  using (organization_id = (select public.current_organization_id()))
  with check (organization_id = (select public.current_organization_id()));
create policy tenant_admin_delete on public.appointment_note_attachments for delete to authenticated
  using (organization_id = (select public.current_organization_id()) and exists (
    select 1 from public.organization_members where user_id = (select auth.uid())
      and organization_id = public.current_organization_id() and role = 'admin'
  ));

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'appointment-files', 'appointment-files', false, 52428800,
  array['image/jpeg','image/png','image/webp','image/heic','video/mp4','video/quicktime','video/webm','application/pdf','text/plain','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy appointment_files_tenant_select on storage.objects for select to authenticated
  using (bucket_id = 'appointment-files' and (storage.foldername(name))[1] = (select public.current_organization_id())::text);
create policy appointment_files_tenant_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'appointment-files' and (storage.foldername(name))[1] = (select public.current_organization_id())::text);
create policy appointment_files_tenant_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'appointment-files' and (storage.foldername(name))[1] = (select public.current_organization_id())::text and exists (
    select 1 from public.organization_members where user_id = (select auth.uid())
      and organization_id = public.current_organization_id() and role = 'admin'
  ));

commit;
