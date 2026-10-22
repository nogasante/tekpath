-- Saved KNUST building outlines, so walk mode can look a footprint up
-- without waiting on OpenStreetMap.
-- Apply after 20261022110508_walk_footprint.sql.
-- Then apply supabase/seed/knust_campus_footprints.sql to fill the rows.
-- The app also ships assets/campus-footprints.ts, so lookup works before this is applied.

create table if not exists public.campus_footprints (
  osm_id bigint primary key,
  name text,
  latitude double precision not null,
  longitude double precision not null,
  footprint_geojson jsonb not null,
  area_m2 numeric not null,
  perimeter_m numeric not null,
  entrances jsonb not null default '[]'::jsonb,
  constraint campus_footprints_area_chk check (area_m2 >= 0 and area_m2 < 10000000),
  constraint campus_footprints_perimeter_chk check (perimeter_m >= 0 and perimeter_m < 100000)
);

comment on table public.campus_footprints is
  'KNUST building outlines from OpenStreetMap. Public read. Filled by the seed, not by the app.';

alter table public.campus_footprints enable row level security;

drop policy if exists campus_footprints_select on public.campus_footprints;
create policy campus_footprints_select
  on public.campus_footprints
  for select
  to anon, authenticated
  using (true);

revoke insert, update, delete on table public.campus_footprints from anon, authenticated;
grant select on table public.campus_footprints to anon, authenticated;

create index if not exists campus_footprints_lat_lng
  on public.campus_footprints (latitude, longitude);
