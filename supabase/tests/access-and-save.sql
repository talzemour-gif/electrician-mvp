-- Run in the Supabase SQL Editor as postgres. All fixtures roll back.
begin;

select set_config('test.org_a', gen_random_uuid()::text, true);
select set_config('test.org_b', gen_random_uuid()::text, true);
select set_config('test.admin_a', gen_random_uuid()::text, true);
select set_config('test.staff_a', gen_random_uuid()::text, true);
select set_config('test.admin_b', gen_random_uuid()::text, true);

insert into public.organizations(id, name) values
  (current_setting('test.org_a')::uuid, 'Isolation test A'),
  (current_setting('test.org_b')::uuid, 'Isolation test B');
insert into auth.users(id) values
  (current_setting('test.admin_a')::uuid),
  (current_setting('test.staff_a')::uuid),
  (current_setting('test.admin_b')::uuid);
insert into public.organization_members(user_id, organization_id, role) values
  (current_setting('test.admin_a')::uuid, current_setting('test.org_a')::uuid, 'admin'),
  (current_setting('test.staff_a')::uuid, current_setting('test.org_a')::uuid, 'staff'),
  (current_setting('test.admin_b')::uuid, current_setting('test.org_b')::uuid, 'admin');
insert into public.job_types(organization_id, name, default_price, default_duration_minutes) values
  (current_setting('test.org_a')::uuid, 'Shared service name', 100, 30),
  (current_setting('test.org_b')::uuid, 'Shared service name', 200, 45);
insert into public.customers(organization_id, full_name, phone)
values (current_setting('test.org_b')::uuid, 'Tenant B private customer', '222');

select set_config('request.jwt.claim.sub', current_setting('test.admin_a'), true);
set local role authenticated;
do $$
declare c uuid; a uuid; v_note_id uuid; n integer;
begin
  if public.current_organization_id() <> current_setting('test.org_a')::uuid then raise exception 'Wrong current organization'; end if;
  if (select count(*) from public.organizations) <> 1 then raise exception 'Organization isolation failed'; end if;
  if exists(select 1 from public.customers where full_name = 'Tenant B private customer') then raise exception 'Cross-tenant customer read allowed'; end if;
  if (select count(*) from public.job_types where name = 'Shared service name') <> 1 then raise exception 'Service isolation failed'; end if;

  c := public.create_customer('Database verification','000-0000000','Test city','Test','Test address','Test notes');
  if not exists(select 1 from public.customers where id = c and organization_id = current_setting('test.org_a')::uuid) then raise exception 'Customer tenant not assigned'; end if;
  if not exists(select 1 from public.customer_addresses where customer_id = c and address = 'Test address' and organization_id = current_setting('test.org_a')::uuid) then raise exception 'Address not saved in tenant'; end if;
  update public.customers set notes = 'Updated notes' where id = c;
  if not exists(select 1 from public.customers where id = c and notes = 'Updated notes') then raise exception 'Update failed'; end if;

  insert into public.appointments(customer_id, customer_address_id, job_type_id, starts_at, duration_minutes, price)
  values (
    c,
    (select id from public.customer_addresses where customer_id = c limit 1),
    (select id from public.job_types where name = 'Shared service name' limit 1),
    now() + interval '1 day', 30, 100
  ) returning id into a;
  update public.appointments set status = 'in_progress', started_at = now() where id = a and status = 'scheduled';
  if not found then raise exception 'Appointment start transition failed'; end if;
  insert into public.appointment_notes(appointment_id, note_type, body, use_in_final_report) values(a, 'research', 'Timestamped research note', true) returning id into v_note_id;
  if not exists(select 1 from public.appointment_notes where appointment_id = a and created_by = current_setting('test.admin_a')::uuid) then raise exception 'Appointment note author or tenant assignment failed'; end if;
  insert into public.appointment_note_attachments(note_id, storage_path, file_name, mime_type, size_bytes)
  values(v_note_id, current_setting('test.org_a') || '/test/verification.pdf', 'verification.pdf', 'application/pdf', 100);
  if not exists(select 1 from public.appointment_note_attachments where note_id = v_note_id and organization_id = current_setting('test.org_a')::uuid) then raise exception 'Appointment attachment tenant assignment failed'; end if;
  update public.appointments set status = 'completed', completed_at = now() where id = a and status = 'in_progress';
  if not found then raise exception 'Appointment completion transition failed'; end if;
  begin
    insert into public.appointment_notes(organization_id, appointment_id, note_type, body)
    values(current_setting('test.org_b')::uuid, a, 'meeting_summary', 'Cross tenant note');
    raise exception 'Cross-tenant appointment note insert allowed';
  exception when insufficient_privilege or foreign_key_violation then null;
  end;
  begin
    insert into public.appointment_note_attachments(organization_id, note_id, storage_path, file_name, mime_type, size_bytes)
    values(current_setting('test.org_b')::uuid, v_note_id, current_setting('test.org_b') || '/cross.pdf', 'cross.pdf', 'application/pdf', 100);
    raise exception 'Cross-tenant appointment attachment insert allowed';
  exception when insufficient_privilege or foreign_key_violation then null;
  end;

  select count(*) into n from public.customers;
  begin
    perform public.create_customer('Must roll back','000-0000000','Test city','','Test address','');
    raise exception 'Invalid address was accepted';
  exception when check_violation then null;
  end;
  if (select count(*) from public.customers) <> n then raise exception 'Partial customer remained'; end if;

  c := public.create_customer_with_addresses(
    'Multi-address verification', '000-0000000', 'Temporary test',
    jsonb_build_array(
      jsonb_build_object('label', '', 'address', 'Street 1', 'city', 'City 1', 'latitude', 32.1, 'longitude', 34.8),
      jsonb_build_object('label', 'Office', 'address', 'Street 2', 'city', 'City 2', 'latitude', 32.2, 'longitude', 34.9)
    ), 'referral'
  );
  if (select count(*) from public.customer_addresses where customer_id = c) <> 2 then raise exception 'Multi-address save failed'; end if;
  if not exists(select 1 from public.customers where id = c and contact_source = 'referral') then raise exception 'Contact source save failed'; end if;
  update public.appointments set payment_status = 'partially_paid' where id = a;
  if not exists(select 1 from public.appointments where id = a and payment_status = 'partially_paid') then raise exception 'Payment status update failed'; end if;

  begin
    insert into public.customers(organization_id, full_name, phone)
    values(current_setting('test.org_b')::uuid, 'Cross tenant write', '999');
    raise exception 'Cross-tenant insert allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.customers set organization_id = current_setting('test.org_b')::uuid where id = c;
    raise exception 'Cross-tenant move allowed';
  exception when insufficient_privilege or foreign_key_violation then null;
  end;
  begin
    insert into public.organization_members(user_id, organization_id)
    values(gen_random_uuid(), current_setting('test.org_a')::uuid);
    raise exception 'Member can grant membership';
  exception when insufficient_privilege then null;
  end;

  delete from public.customers where id = c;
  if exists(select 1 from public.customer_addresses where customer_id = c) then raise exception 'Address cascade failed'; end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', current_setting('test.staff_a'), true);
set local role authenticated;
do $$
declare c uuid;
begin
  c := public.create_customer_with_addresses(
    'Restricted staff verification', '000-0000000', '',
    jsonb_build_array(jsonb_build_object('label', 'Test', 'address', 'Street 3', 'city', 'City 3', 'latitude', 32.3, 'longitude', 34.7))
  );
  update public.customers set notes = 'Staff update allowed' where id = c;
  if not found then raise exception 'Staff update denied'; end if;
  delete from public.customers where id = c;
  if found then raise exception 'Staff delete allowed'; end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
set local role authenticated;
do $$ begin
  if exists(select 1 from public.job_types) then raise exception 'Non-member can read business data'; end if;
  begin
    perform public.create_customer('Denied','000-0000000');
    raise exception 'Non-member can write';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role anon;
do $$ begin
  begin
    perform 1 from public.customers;
    raise exception 'Anonymous read allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

rollback;
select 'PASS: tenant isolation, appointment workflow and notes, tenant assignment, admin/staff permissions, atomic save, non-member and anonymous denial' as result;
