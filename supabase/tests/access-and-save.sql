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
declare c uuid; n integer;
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
    )
  );
  if (select count(*) from public.customer_addresses where customer_id = c) <> 2 then raise exception 'Multi-address save failed'; end if;

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
select 'PASS: tenant isolation, tenant assignment, admin/staff permissions, atomic save, non-member and anonymous denial' as result;
