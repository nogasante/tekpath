-- Walk-mode footprints and indoor node kinds.
-- PostGIS stays in the extensions schema. The app sends GeoJSON; the trigger
-- writes buildings.footprint and the measured area and perimeter.
-- Apply after 20261022105043_guest_identity.sql.

alter table public.buildings
  add column if not exists footprint_geojson jsonb,
  add column if not exists area_m2 numeric,
  add column if not exists perimeter_m numeric;

alter table public.buildings drop constraint if exists buildings_area_chk;
alter table public.buildings
  add constraint buildings_area_chk check (area_m2 is null or (area_m2 >= 0 and area_m2 < 10000000));

alter table public.buildings drop constraint if exists buildings_perimeter_chk;
alter table public.buildings
  add constraint buildings_perimeter_chk check (perimeter_m is null or (perimeter_m >= 0 and perimeter_m < 100000));

comment on column public.buildings.footprint is 'Building outline, WGS84 polygon. Filled from footprint_geojson.';
comment on column public.buildings.footprint_geojson is 'GeoJSON Polygon the app draws. The trigger copies it into footprint.';
comment on column public.buildings.area_m2 is 'Outline area in square metres, from the geography perimeter of footprint.';
comment on column public.buildings.perimeter_m is 'Outline perimeter in metres.';

create or replace function private.sync_building_footprint()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if new.footprint_geojson is not null then
    begin
      new.footprint := extensions.st_setsrid(
        extensions.st_geomfromgeojson(new.footprint_geojson::text),
        4326
      );
    exception
      when others then
        -- Keep a previously valid polygon if this GeoJSON cannot be read.
        null;
    end;
  end if;

  if new.footprint is not null then
    new.area_m2 := extensions.st_area(new.footprint::extensions.geography);
    new.perimeter_m := extensions.st_perimeter(new.footprint::extensions.geography);
    if new.footprint_geojson is null then
      new.footprint_geojson := extensions.st_asgeojson(new.footprint)::jsonb;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists buildings_sync_footprint on public.buildings;
create trigger buildings_sync_footprint
before insert or update of footprint, footprint_geojson on public.buildings
for each row execute function private.sync_building_footprint();

-- Seeded outlines (Engineering Lecture Block) get area, perimeter, and GeoJSON.
update public.buildings
set footprint = footprint
where footprint is not null;

alter table public.nodes drop constraint if exists nodes_type_chk;
alter table public.nodes
  add constraint nodes_type_chk check (
    type in (
      'entrance', 'ramp', 'lift', 'corridor', 'room', 'toilet', 'junction', 'outdoor',
      'stairs', 'landmark', 'obstacle'
    )
  );
