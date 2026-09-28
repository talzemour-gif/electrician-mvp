-- Capture a readable author identity for appointment notes.
begin;

alter table public.appointment_notes
  add column author_email text;

update public.appointment_notes as note
set author_email = users.email
from auth.users as users
where users.id = note.created_by;

alter table public.appointment_notes
  alter column author_email set default (auth.jwt() ->> 'email'),
  alter column author_email set not null;

commit;
