-- Phase 2: payment tracking and customer acquisition source.
begin;

alter table public.customers
  add column contact_source text
  constraint customers_contact_source_check check (
    contact_source is null or contact_source in ('referral', 'google', 'returning_customer', 'website', 'facebook_instagram', 'whatsapp', 'phone', 'other')
  );

alter table public.appointments
  add column payment_status text not null default 'unpaid'
  constraint appointments_payment_status_check check (payment_status in ('unpaid', 'partially_paid', 'paid'));

drop function public.create_customer_with_addresses(text,text,text,jsonb);
create function public.create_customer_with_addresses(
  p_name text, p_phone text, p_notes text default '', p_addresses jsonb default '[]'::jsonb,
  p_contact_source text default null
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare new_id uuid; item jsonb; item_label text; item_address text; item_city text; item_latitude double precision; item_longitude double precision; item_index integer := 0;
begin
  if jsonb_typeof(coalesce(p_addresses, '[]'::jsonb)) <> 'array' then
    raise exception 'Addresses must be an array' using errcode = '22023';
  end if;
  insert into public.customers(full_name, phone, notes, contact_source)
    values (btrim(p_name), btrim(p_phone), nullif(btrim(p_notes), ''), nullif(btrim(p_contact_source), '')) returning id into new_id;
  for item in select value from jsonb_array_elements(coalesce(p_addresses, '[]'::jsonb)) loop
    item_label := coalesce(nullif(btrim(item->>'label'), ''), 'כתובת');
    item_address := btrim(coalesce(item->>'address', ''));
    item_city := btrim(coalesce(item->>'city', ''));
    item_latitude := (item->>'latitude')::double precision;
    item_longitude := (item->>'longitude')::double precision;
    if item_address = '' or item_city = '' then raise exception 'Each address requires an address and city' using errcode = '23514'; end if;
    if item_latitude is null or item_longitude is null then raise exception 'Each address requires verified coordinates' using errcode = '23514'; end if;
    insert into public.customer_addresses(customer_id, label, address, city, latitude, longitude, is_default)
      values (new_id, item_label, item_address, item_city, item_latitude, item_longitude, item_index = 0);
    item_index := item_index + 1;
  end loop;
  return new_id;
end $$;
revoke all on function public.create_customer_with_addresses(text,text,text,jsonb,text) from public, anon;
grant execute on function public.create_customer_with_addresses(text,text,text,jsonb,text) to authenticated;

commit;
