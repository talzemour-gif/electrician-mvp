-- Tighten the coordinate-pair check after the first manual hosted migration.
alter table public.customer_addresses drop constraint address_coordinates_together;
alter table public.customer_addresses add constraint address_coordinates_together check (
  (latitude is null and longitude is null) or
  (latitude is not null and longitude is not null and latitude between -90 and 90 and longitude between -180 and 180)
);
