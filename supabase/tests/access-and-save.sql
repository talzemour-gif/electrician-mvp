-- Run in the Supabase SQL Editor as postgres. All fixtures roll back.
begin;
select set_config('test.staff_id', gen_random_uuid()::text, true);
insert into auth.users(id) values(current_setting('test.staff_id')::uuid);
insert into public.app_members(user_id, role) values(current_setting('test.staff_id')::uuid, 'admin');
select set_config('request.jwt.claim.sub', current_setting('test.staff_id'), true);
set local role authenticated;
do $$
declare c uuid; n integer;
begin
  c := public.create_customer('Database verification','000-0000000','Test city','Test','Test address','Test notes');
  if not exists(select 1 from public.customer_addresses where customer_id=c and address='Test address') then raise exception 'Address not saved'; end if;
  update public.customers set notes='Updated notes' where id=c;
  if not exists(select 1 from public.customers where id=c and notes='Updated notes') then raise exception 'Update failed'; end if;
  select count(*) into n from public.customers;
  begin
    perform public.create_customer('Must roll back','000-0000000','Test city','','Test address','');
    raise exception 'Invalid address was accepted';
  exception when check_violation then null;
  end;
  if (select count(*) from public.customers) <> n then raise exception 'Partial customer remained'; end if;
  if (select count(*) from public.job_types) < 3 then raise exception 'Price list seed missing'; end if;
  c := public.create_customer_with_addresses(
    'Multi-address verification', '000-0000000', 'Temporary test',
    jsonb_build_array(
      jsonb_build_object('label', '', 'address', 'Street 1', 'city', 'City 1', 'latitude', 32.1, 'longitude', 34.8),
      jsonb_build_object('label', 'Office', 'address', 'Street 2', 'city', 'City 2', 'latitude', 32.2, 'longitude', 34.9)
    )
  );
  if (select count(*) from public.customer_addresses where customer_id = c) <> 2 then raise exception 'Multi-address save failed'; end if;
  if not exists(select 1 from public.customer_addresses where customer_id = c and label = 'כתובת' and is_default) then raise exception 'Optional address label default failed'; end if;
  if not exists(select 1 from public.customer_addresses where customer_id = c and latitude = 32.1 and longitude = 34.8) then raise exception 'Verified coordinates not saved'; end if;
  delete from public.customers where id = c;
  begin
    insert into public.app_members(user_id) values(gen_random_uuid());
    raise exception 'Staff can grant membership';
  exception when insufficient_privilege then null;
  end;
  delete from public.customers where id=c;
  if exists(select 1 from public.customer_addresses where customer_id=c) then raise exception 'Address cascade failed'; end if;
end $$;
reset role;
select set_config('test.readonly_delete_id', gen_random_uuid()::text, true);
insert into auth.users(id) values(current_setting('test.readonly_delete_id')::uuid);
insert into public.app_members(user_id, role) values(current_setting('test.readonly_delete_id')::uuid, 'staff');
select set_config('request.jwt.claim.sub', current_setting('test.readonly_delete_id'), true);
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
  update public.job_types set default_price=1;
  if found then raise exception 'Non-member can update'; end if;
  delete from public.job_types;
  if found then raise exception 'Non-member can delete'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform 1 from public.customers;
    raise exception 'Anonymous read allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_customer('Denied','000-0000000');
    raise exception 'Anonymous write allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
rollback;
select 'PASS: admin CRUD, staff update/delete restriction, multi-address save, rollback, membership protection, non-member and anonymous denial' as result;
