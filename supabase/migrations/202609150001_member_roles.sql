-- Distinguish administrators from staff and reserve destructive operations for administrators.
begin;

alter table public.app_members
  add column role text not null default 'staff'
  check (role in ('admin', 'staff'));

update public.app_members
set role = 'admin'
where user_id in (select id from auth.users where lower(email) = 'talzemour@gmail.com');

do $$
declare t text;
begin
  foreach t in array array['customers','customer_addresses','job_types','appointments','availability_blocks','appointment_reschedules'] loop
    execute format('drop policy if exists staff_access on public.%I', t);
    execute format('create policy member_select on public.%I for select to authenticated using (exists (select 1 from public.app_members where user_id = (select auth.uid())))', t);
    execute format('create policy member_insert on public.%I for insert to authenticated with check (exists (select 1 from public.app_members where user_id = (select auth.uid())))', t);
    execute format('create policy member_update on public.%I for update to authenticated using (exists (select 1 from public.app_members where user_id = (select auth.uid()))) with check (exists (select 1 from public.app_members where user_id = (select auth.uid())))', t);
    execute format('create policy admin_delete on public.%I for delete to authenticated using (exists (select 1 from public.app_members where user_id = (select auth.uid()) and role = ''admin''))', t);
  end loop;
end $$;

commit;
