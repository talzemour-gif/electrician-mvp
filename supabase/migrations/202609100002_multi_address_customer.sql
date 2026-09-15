-- Save a customer and all initial addresses atomically.
create or replace function public.create_customer_with_addresses(
  p_name text,
  p_phone text,
  p_notes text default '',
  p_addresses jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_id uuid;
  item jsonb;
  item_label text;
  item_address text;
  item_city text;
  item_index integer := 0;
begin
  if jsonb_typeof(coalesce(p_addresses, '[]'::jsonb)) <> 'array' then
    raise exception 'Addresses must be an array' using errcode = '22023';
  end if;

  insert into public.customers(full_name, phone, notes)
    values (btrim(p_name), btrim(p_phone), nullif(btrim(p_notes), ''))
    returning id into new_id;

  for item in select value from jsonb_array_elements(coalesce(p_addresses, '[]'::jsonb)) loop
    item_label := coalesce(nullif(btrim(item->>'label'), ''), 'כתובת');
    item_address := btrim(coalesce(item->>'address', ''));
    item_city := btrim(coalesce(item->>'city', ''));
    if item_address = '' or item_city = '' then
      raise exception 'Each address requires an address and city' using errcode = '23514';
    end if;
    insert into public.customer_addresses(customer_id, label, address, city, is_default)
      values (new_id, item_label, item_address, item_city, item_index = 0);
    item_index := item_index + 1;
  end loop;

  return new_id;
end $$;

revoke all on function public.create_customer_with_addresses(text,text,text,jsonb) from public, anon;
grant execute on function public.create_customer_with_addresses(text,text,text,jsonb) to authenticated;
