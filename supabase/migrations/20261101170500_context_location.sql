-- ADR-0007, section 7. A context with a place makes the proofs of its tasks check the distance. All of
-- the fields or none: the address is free text for people, and the point comes from the device, so
-- there is no geocoding. Limits repeat contextLocationSchema in packages/contracts. A check passes on
-- NULL, so the second branch names every column: otherwise a half-filled place would get through.
alter table public.contexts
  add column location_address text,
  add column location_lat double precision,
  add column location_lng double precision,
  add column location_radius_m int,
  add constraint contexts_location_check check (
    (
      location_address is null and location_lat is null and location_lng is null
      and location_radius_m is null
    )
    or (
      location_address is not null and location_lat is not null and location_lng is not null
      and location_radius_m is not null
      and char_length(btrim(location_address)) between 1 and 200
      and location_lat between -90 and 90
      and location_lng between -180 and 180
      and location_radius_m between 20 and 5000
    )
  );

-- Like the other editable fields. Who may write is still decided by the policies (context.manage).
grant insert (location_address, location_lat, location_lng, location_radius_m)
  on public.contexts to authenticated;
grant update (location_address, location_lat, location_lng, location_radius_m)
  on public.contexts to authenticated;
