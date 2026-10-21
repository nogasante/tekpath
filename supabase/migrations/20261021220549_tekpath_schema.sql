-- TekPath schema: campus graph, accessibility reports, and step-free routing.
-- pgRouting is not part of the default Supabase image, so routing is Dijkstra in plpgsql.
-- Coordinates are stored as latitude/longitude and mirrored into PostGIS points.

create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to postgres, service_role, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  mobility_needs text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_len check (char_length(display_name) <= 80),
  constraint profiles_mobility_needs_len check (mobility_needs is null or char_length(mobility_needs) <= 500)
);

create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  description text,
  latitude double precision not null,
  longitude double precision not null,
  geom extensions.geometry(Point, 4326) not null,
  footprint extensions.geometry(Polygon, 4326),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint buildings_name_len check (char_length(name) between 1 and 120),
  constraint buildings_code_len check (char_length(code) between 1 and 16),
  constraint buildings_lat_chk check (latitude between -90 and 90),
  constraint buildings_lng_chk check (longitude between -180 and 180)
);

create table public.floors (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings (id) on delete cascade,
  level integer not null,
  name text not null,
  diagram_url text,
  layout jsonb,
  floor_height_m numeric not null default 3.5,
  pressure_hpa_per_m numeric not null default 0.12,
  ref_pressure_hpa numeric,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint floors_level_unique unique (building_id, level),
  constraint floors_height_chk check (floor_height_m > 0 and floor_height_m < 30),
  constraint floors_hpa_chk check (pressure_hpa_per_m > 0 and pressure_hpa_per_m < 2),
  constraint floors_name_len check (char_length(name) between 1 and 80)
);

create table public.nodes (
  id uuid primary key default gen_random_uuid(),
  building_id uuid references public.buildings (id) on delete cascade,
  floor_id uuid references public.floors (id) on delete cascade,
  type text not null,
  name text not null,
  landmark_description text,
  latitude double precision not null,
  longitude double precision not null,
  geom extensions.geometry(Point, 4326) not null,
  qr_code text unique,
  step_free boolean not null default true,
  plan_x numeric,
  plan_y numeric,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint nodes_type_chk check (
    type in ('entrance', 'ramp', 'lift', 'corridor', 'room', 'toilet', 'junction', 'outdoor')
  ),
  constraint nodes_name_len check (char_length(name) between 1 and 120),
  constraint nodes_lat_chk check (latitude between -90 and 90),
  constraint nodes_lng_chk check (longitude between -180 and 180),
  constraint nodes_qr_len check (qr_code is null or char_length(qr_code) between 3 and 64)
);

create table public.edges (
  id uuid primary key default gen_random_uuid(),
  from_node uuid not null references public.nodes (id) on delete cascade,
  to_node uuid not null references public.nodes (id) on delete cascade,
  type text not null,
  step_free boolean not null default true,
  length_m numeric not null,
  instruction_text text,
  reverse_instruction_text text,
  bidirectional boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint edges_type_chk check (type in ('corridor', 'ramp', 'lift', 'stairs', 'path')),
  constraint edges_length_chk check (length_m > 0 and length_m < 10000),
  constraint edges_distinct_chk check (from_node <> to_node)
);

create table public.features (
  id uuid primary key default gen_random_uuid(),
  node_id uuid references public.nodes (id) on delete set null,
  building_id uuid references public.buildings (id) on delete set null,
  kind text not null,
  name text not null,
  status text not null default 'unknown',
  last_reported_at timestamptz,
  latitude double precision not null,
  longitude double precision not null,
  geom extensions.geometry(Point, 4326) not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint features_kind_chk check (kind in ('ramp', 'lift', 'toilet', 'parking', 'entrance')),
  constraint features_status_chk check (status in ('working', 'broken', 'unknown')),
  constraint features_name_len check (char_length(name) between 1 and 120),
  constraint features_lat_chk check (latitude between -90 and 90),
  constraint features_lng_chk check (longitude between -180 and 180)
);

alter table public.nodes
  add column feature_id uuid references public.features (id) on delete set null;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  feature_id uuid references public.features (id) on delete cascade,
  node_id uuid references public.nodes (id) on delete set null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null,
  note text,
  photo_url text,
  created_at timestamptz not null default now(),
  constraint reports_status_chk check (status in ('working', 'broken', 'unknown')),
  constraint reports_target_chk check (feature_id is not null or node_id is not null),
  constraint reports_note_len check (note is null or char_length(note) <= 2000)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index buildings_geom_gix on public.buildings using gist (geom);
create index buildings_created_by_idx on public.buildings (created_by);
create index floors_building_idx on public.floors (building_id);
create index floors_created_by_idx on public.floors (created_by);
create index nodes_geom_gix on public.nodes using gist (geom);
create index nodes_building_idx on public.nodes (building_id);
create index nodes_floor_idx on public.nodes (floor_id);
create index nodes_feature_idx on public.nodes (feature_id);
create index nodes_type_idx on public.nodes (type);
create index nodes_created_by_idx on public.nodes (created_by);
create index edges_from_idx on public.edges (from_node);
create index edges_to_idx on public.edges (to_node);
create index edges_created_by_idx on public.edges (created_by);
create index features_geom_gix on public.features using gist (geom);
create index features_node_idx on public.features (node_id);
create index features_status_idx on public.features (status);
create index features_created_by_idx on public.features (created_by);
create index reports_feature_created_idx on public.reports (feature_id, created_at desc);
create index reports_user_idx on public.reports (user_id);

-- ---------------------------------------------------------------------------
-- Geometry sync and ownership
-- ---------------------------------------------------------------------------

create or replace function private.sync_point_geom()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if new.latitude is not null and new.longitude is not null then
    new.geom := extensions.st_setsrid(
      extensions.st_makepoint(new.longitude, new.latitude),
      4326
    );
  elsif new.geom is not null then
    new.latitude := extensions.st_y(new.geom);
    new.longitude := extensions.st_x(new.geom);
  end if;
  return new;
end;
$$;

create or replace function private.set_row_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

create or replace function private.set_report_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$$;

create or replace function private.sync_feature_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  if tg_op is null then
    return null;
  end if;

  target := new.feature_id;
  if target is null and new.node_id is not null then
    select n.feature_id into target
    from public.nodes n
    where n.id = new.node_id;
    if target is null then
      select f.id into target
      from public.features f
      where f.node_id = new.node_id
      order by f.created_at desc
      limit 1;
    end if;
  end if;

  if target is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.reports r
    where r.feature_id = target
      and r.id <> new.id
      and r.created_at > new.created_at
  ) then
    update public.features
    set status = new.status,
        last_reported_at = new.created_at
    where id = target;
  end if;

  return new;
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      split_part(coalesce(new.email, 'student'), '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger buildings_sync_geom
before insert or update of latitude, longitude, geom on public.buildings
for each row execute function private.sync_point_geom();

create trigger nodes_sync_geom
before insert or update of latitude, longitude, geom on public.nodes
for each row execute function private.sync_point_geom();

create trigger features_sync_geom
before insert or update of latitude, longitude, geom on public.features
for each row execute function private.sync_point_geom();

create trigger buildings_set_owner
before insert on public.buildings
for each row execute function private.set_row_owner();

create trigger floors_set_owner
before insert on public.floors
for each row execute function private.set_row_owner();

create trigger nodes_set_owner
before insert on public.nodes
for each row execute function private.set_row_owner();

create trigger edges_set_owner
before insert on public.edges
for each row execute function private.set_row_owner();

create trigger features_set_owner
before insert on public.features
for each row execute function private.set_row_owner();

create trigger reports_set_user
before insert on public.reports
for each row execute function private.set_report_user();

create trigger reports_sync_status
after insert or update of status on public.reports
for each row execute function private.sync_feature_status();

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Routing
-- ---------------------------------------------------------------------------

create or replace function private.edge_is_blocked(
  p_type text,
  p_from uuid,
  p_to uuid,
  p_blocked uuid[]
)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select p_type in ('lift', 'ramp')
    and coalesce(cardinality(p_blocked), 0) > 0
    and exists (
      select 1
      from public.nodes n
      where n.id in (p_from, p_to)
        and (
          n.feature_id = any (p_blocked)
          or exists (
            select 1
            from public.features f
            where f.id = any (p_blocked)
              and f.node_id = n.id
          )
        )
    );
$$;

create or replace function private.route_payload(
  p_nodes uuid[],
  p_edges uuid[]
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_steps jsonb := '[]'::jsonb;
  v_len integer;
  v_i integer;
  v_node record;
  v_edge record;
  v_instruction text;
  v_edge_type text;
  v_edge_id uuid;
  v_distance numeric := 0;
begin
  v_len := coalesce(cardinality(p_nodes), 0);
  if v_len = 0 then
    return jsonb_build_object(
      'ok', false,
      'message', 'No step-free route exists between these places.',
      'distance_m', null,
      'steps', '[]'::jsonb,
      'blockers', '[]'::jsonb
    );
  end if;

  for v_i in 1..v_len loop
    select
      n.id,
      n.name,
      n.type,
      n.landmark_description,
      n.qr_code,
      n.plan_x,
      n.plan_y,
      n.floor_id,
      f.level as floor_level,
      f.name as floor_name,
      b.name as building_name
    into v_node
    from public.nodes n
    left join public.floors f on f.id = n.floor_id
    left join public.buildings b on b.id = n.building_id
    where n.id = p_nodes[v_i];

    v_edge_type := null;
    v_edge_id := null;

    if v_i = 1 then
      v_instruction := 'You are at ' || v_node.name || '. ' ||
        coalesce(nullif(btrim(v_node.landmark_description), ''), 'This is your starting point.');
    else
      select
        e.id,
        e.type,
        e.from_node,
        e.to_node,
        e.instruction_text,
        e.reverse_instruction_text,
        e.length_m
      into v_edge
      from public.edges e
      where e.id = p_edges[v_i - 1];

      v_edge_id := v_edge.id;
      v_edge_type := v_edge.type;
      v_distance := v_distance + coalesce(v_edge.length_m, 0);

      if v_edge.from_node = p_nodes[v_i - 1] then
        v_instruction := v_edge.instruction_text;
      else
        v_instruction := coalesce(nullif(btrim(v_edge.reverse_instruction_text), ''), v_edge.instruction_text);
      end if;

      if v_instruction is null or btrim(v_instruction) = '' then
        v_instruction := 'Continue to ' || v_node.name || '.';
      end if;

      if v_i = v_len and position(lower(v_node.name) in lower(v_instruction)) = 0 then
        v_instruction := v_instruction || ' You have arrived at ' || v_node.name || '.';
      elsif v_i = v_len and position('arrived' in lower(v_instruction)) = 0 then
        v_instruction := v_instruction || ' You have arrived.';
      end if;
    end if;

    v_steps := v_steps || jsonb_build_array(jsonb_build_object(
      'order', v_i,
      'node_id', v_node.id,
      'node_name', v_node.name,
      'node_type', v_node.type,
      'landmark_description', v_node.landmark_description,
      'instruction', v_instruction,
      'floor_level', v_node.floor_level,
      'floor_name', v_node.floor_name,
      'floor_id', v_node.floor_id,
      'plan_x', v_node.plan_x,
      'plan_y', v_node.plan_y,
      'building_name', v_node.building_name,
      'edge_type', v_edge_type,
      'edge_id', v_edge_id,
      'qr_code', v_node.qr_code
    ));
  end loop;

  return jsonb_build_object(
    'ok', true,
    'message', null,
    'distance_m', v_distance,
    'steps', v_steps,
    'blockers', '[]'::jsonb
  );
end;
$$;

create or replace function private.dijkstra(
  p_from uuid,
  p_to uuid,
  p_blocked uuid[]
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_dist jsonb := '{}'::jsonb;
  v_prev jsonb := '{}'::jsonb;
  v_via jsonb := '{}'::jsonb;
  v_visited jsonb := '{}'::jsonb;
  v_current text;
  v_best numeric;
  v_node text;
  v_d numeric;
  v_edge record;
  v_alt numeric;
  v_nxt text;
  v_nodes uuid[] := '{}';
  v_edges uuid[] := '{}';
  v_walk text;
  v_prev_text text;
  v_guard integer := 0;
begin
  if p_from = p_to then
    return jsonb_build_object(
      'nodes', to_jsonb(array[p_from]),
      'edges', '[]'::jsonb,
      'distance_m', 0
    );
  end if;

  v_dist := jsonb_build_object(p_from::text, 0);

  loop
    v_current := null;
    v_best := null;
    for v_node in select jsonb_object_keys(v_dist)
    loop
      if v_visited ? v_node then
        continue;
      end if;
      v_d := (v_dist ->> v_node)::numeric;
      if v_best is null or v_d < v_best or (v_d = v_best and (v_current is null or v_node < v_current)) then
        v_best := v_d;
        v_current := v_node;
      end if;
    end loop;

    exit when v_current is null;

    v_visited := v_visited || jsonb_build_object(v_current, true);
    exit when v_current = p_to::text;

    for v_edge in
      select e.id, e.from_node, e.to_node, e.type, e.length_m
      from public.edges e
      where e.step_free
        and e.type <> 'stairs'
        and (
          e.from_node = v_current::uuid
          or (e.bidirectional and e.to_node = v_current::uuid)
        )
    loop
      if private.edge_is_blocked(v_edge.type, v_edge.from_node, v_edge.to_node, p_blocked) then
        continue;
      end if;

      if v_edge.from_node = v_current::uuid then
        v_nxt := v_edge.to_node::text;
      else
        v_nxt := v_edge.from_node::text;
      end if;

      if v_visited ? v_nxt then
        continue;
      end if;

      v_alt := v_best + v_edge.length_m;
      if (v_dist ->> v_nxt) is null or v_alt < (v_dist ->> v_nxt)::numeric then
        v_dist := jsonb_set(v_dist, array[v_nxt], to_jsonb(v_alt), true);
        v_prev := jsonb_set(v_prev, array[v_nxt], to_jsonb(v_current), true);
        v_via := jsonb_set(v_via, array[v_nxt], to_jsonb(v_edge.id), true);
      end if;
    end loop;

    v_guard := v_guard + 1;
    if v_guard > 5000 then
      raise exception 'TekPath route search exceeded the safety limit';
    end if;
  end loop;

  if not (v_visited ? p_to::text) then
    return null;
  end if;

  v_walk := p_to::text;
  v_guard := 0;
  while v_walk is not null loop
    v_nodes := array_prepend(v_walk::uuid, v_nodes);
    v_prev_text := v_prev ->> v_walk;
    if v_prev_text is not null then
      v_edges := array_prepend((v_via ->> v_walk)::uuid, v_edges);
    end if;
    v_walk := v_prev_text;
    v_guard := v_guard + 1;
    if v_guard > 5000 then
      raise exception 'TekPath route reconstruction exceeded the safety limit';
    end if;
  end loop;

  return jsonb_build_object(
    'nodes', to_jsonb(v_nodes),
    'edges', to_jsonb(v_edges),
    'distance_m', (v_dist ->> p_to::text)::numeric
  );
end;
$$;

create or replace function private.broken_on_path(p_edges uuid[])
returns uuid[]
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(array_agg(distinct f.id), '{}'::uuid[])
  from public.edges e
  join public.nodes n on n.id in (e.from_node, e.to_node)
  join public.features f on (f.id = n.feature_id or f.node_id = n.id)
  where e.id = any (p_edges)
    and e.type in ('lift', 'ramp')
    and f.status = 'broken';
$$;

create or replace function public.find_step_free_route(p_from uuid, p_to uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_broken uuid[];
  v_path jsonb;
  v_nodes uuid[];
  v_edges uuid[];
  v_accounted uuid[] := '{}';
  v_blockers uuid[] := '{}';
  v_used uuid[];
  v_names text[];
  v_phrase text;
  v_blocker_json jsonb;
  v_guard integer := 0;
begin
  if p_from is null or p_to is null then
    return jsonb_build_object(
      'ok', false,
      'message', 'Choose both a start and a destination.',
      'distance_m', null,
      'steps', '[]'::jsonb,
      'blockers', '[]'::jsonb
    );
  end if;

  if not exists (select 1 from public.nodes where id = p_from) then
    return jsonb_build_object(
      'ok', false,
      'message', 'The start point is not on the TekPath map.',
      'distance_m', null,
      'steps', '[]'::jsonb,
      'blockers', '[]'::jsonb
    );
  end if;

  if not exists (select 1 from public.nodes where id = p_to) then
    return jsonb_build_object(
      'ok', false,
      'message', 'That destination is not on the TekPath map.',
      'distance_m', null,
      'steps', '[]'::jsonb,
      'blockers', '[]'::jsonb
    );
  end if;

  if p_from = p_to then
    return private.route_payload(array[p_from], '{}'::uuid[]);
  end if;

  select coalesce(array_agg(id), '{}'::uuid[])
  into v_broken
  from public.features
  where status = 'broken';

  v_path := private.dijkstra(p_from, p_to, v_broken);
  if v_path is not null then
    select coalesce(array_agg(value::uuid order by ord), '{}'::uuid[])
    into v_nodes
    from jsonb_array_elements_text(v_path -> 'nodes') with ordinality as t(value, ord);
    select coalesce(array_agg(value::uuid order by ord), '{}'::uuid[])
    into v_edges
    from jsonb_array_elements_text(v_path -> 'edges') with ordinality as t(value, ord);
    return private.route_payload(v_nodes, v_edges);
  end if;

  -- Name every broken lift or ramp that sits on a step-free alternative.
  loop
    v_guard := v_guard + 1;
    exit when v_guard > 20;

    v_path := private.dijkstra(p_from, p_to, v_accounted);
    exit when v_path is null;

    select coalesce(array_agg(value::uuid order by ord), '{}'::uuid[])
    into v_edges
    from jsonb_array_elements_text(v_path -> 'edges') with ordinality as t(value, ord);

    v_used := private.broken_on_path(v_edges);
    exit when v_used is null or cardinality(v_used) = 0 or v_used <@ v_accounted;

    v_blockers := v_blockers || v_used;
    v_accounted := v_accounted || v_used;
  end loop;

  if cardinality(v_blockers) = 0 then
    return jsonb_build_object(
      'ok', false,
      'message', 'No step-free route exists between these places. Stairs may connect them, but TekPath will not send you that way.',
      'distance_m', null,
      'steps', '[]'::jsonb,
      'blockers', '[]'::jsonb
    );
  end if;

  select coalesce(array_agg(distinct f.name order by f.name), '{}'::text[])
  into v_names
  from public.features f
  where f.id = any (v_blockers);

  if cardinality(v_names) = 1 then
    v_phrase := v_names[1] || ' is';
  elsif cardinality(v_names) = 2 then
    v_phrase := v_names[1] || ' and ' || v_names[2] || ' are';
  else
    v_phrase := array_to_string(v_names[1:cardinality(v_names) - 1], ', ')
      || ', and ' || v_names[cardinality(v_names)] || ' are';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', f.id,
        'name', f.name,
        'kind', f.kind,
        'status', f.status
      )
      order by f.name
    ),
    '[]'::jsonb
  )
  into v_blocker_json
  from public.features f
  where f.id = any (v_blockers);

  return jsonb_build_object(
    'ok', false,
    'message', 'No step-free route. ' || v_phrase || ' reported broken.',
    'distance_m', null,
    'steps', '[]'::jsonb,
    'blockers', v_blocker_json
  );
end;
$$;

create or replace function public.nearest_start_node(
  p_lat double precision,
  p_lng double precision
)
returns jsonb
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'node_id', n.id,
    'name', n.name,
    'qr_code', n.qr_code,
    'type', n.type,
    'floor_level', f.level,
    'floor_name', f.name,
    'building_id', n.building_id,
    'building_name', b.name,
    'latitude', n.latitude,
    'longitude', n.longitude,
    'distance_m', round(
      extensions.st_distance(
        n.geom::extensions.geography,
        extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
      )::numeric,
      1
    )
  )
  from public.nodes n
  left join public.floors f on f.id = n.floor_id
  left join public.buildings b on b.id = n.building_id
  where n.type in ('outdoor', 'entrance', 'ramp')
  order by n.geom <-> extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)
  limit 1;
$$;

comment on function public.find_step_free_route(uuid, uuid) is
  'Step-free Dijkstra route. Excludes stairs and any lift or ramp whose feature status is broken.';

-- ---------------------------------------------------------------------------
-- Grants (explicit; Supabase does not grant these by default)
-- ---------------------------------------------------------------------------

grant select on public.profiles to anon;
grant select, insert, update, delete on public.profiles to authenticated, service_role;

grant select on public.buildings to anon;
grant select, insert, update, delete on public.buildings to authenticated, service_role;

grant select on public.floors to anon;
grant select, insert, update, delete on public.floors to authenticated, service_role;

grant select on public.nodes to anon;
grant select, insert, update, delete on public.nodes to authenticated, service_role;

grant select on public.edges to anon;
grant select, insert, update, delete on public.edges to authenticated, service_role;

grant select on public.features to anon;
grant select, insert, update, delete on public.features to authenticated, service_role;

grant select on public.reports to anon;
grant select, insert, update, delete on public.reports to authenticated, service_role;

revoke all on function public.find_step_free_route(uuid, uuid) from public;
revoke all on function public.nearest_start_node(double precision, double precision) from public;
grant execute on function public.find_step_free_route(uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.nearest_start_node(double precision, double precision) to anon, authenticated, service_role;

grant execute on function private.edge_is_blocked(text, uuid, uuid, uuid[]) to anon, authenticated, service_role;
grant execute on function private.route_payload(uuid[], uuid[]) to anon, authenticated, service_role;
grant execute on function private.dijkstra(uuid, uuid, uuid[]) to anon, authenticated, service_role;
grant execute on function private.broken_on_path(uuid[]) to anon, authenticated, service_role;

revoke all on function private.sync_point_geom() from public, anon;
revoke all on function private.set_row_owner() from public, anon;
revoke all on function private.set_report_user() from public, anon;
revoke all on function private.sync_feature_status() from public, anon;
revoke all on function private.handle_new_user() from public, anon, authenticated;

grant execute on function private.sync_point_geom() to authenticated, service_role, postgres;
grant execute on function private.set_row_owner() to authenticated, service_role, postgres;
grant execute on function private.set_report_user() to authenticated, service_role, postgres;
grant execute on function private.sync_feature_status() to authenticated, service_role, postgres;
grant execute on function private.handle_new_user() to supabase_auth_admin, postgres, service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.buildings enable row level security;
alter table public.floors enable row level security;
alter table public.nodes enable row level security;
alter table public.edges enable row level security;
alter table public.features enable row level security;
alter table public.reports enable row level security;

create policy profiles_select on public.profiles
  for select to anon, authenticated
  using (true);

create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy buildings_select on public.buildings
  for select to anon, authenticated
  using (true);

create policy buildings_insert on public.buildings
  for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy buildings_update on public.buildings
  for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create policy buildings_delete on public.buildings
  for delete to authenticated
  using (created_by = (select auth.uid()));

create policy floors_select on public.floors
  for select to anon, authenticated
  using (true);

create policy floors_insert on public.floors
  for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy floors_update on public.floors
  for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create policy floors_delete on public.floors
  for delete to authenticated
  using (created_by = (select auth.uid()));

create policy nodes_select on public.nodes
  for select to anon, authenticated
  using (true);

create policy nodes_insert on public.nodes
  for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy nodes_update on public.nodes
  for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create policy nodes_delete on public.nodes
  for delete to authenticated
  using (created_by = (select auth.uid()));

create policy edges_select on public.edges
  for select to anon, authenticated
  using (true);

create policy edges_insert on public.edges
  for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy edges_update on public.edges
  for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create policy edges_delete on public.edges
  for delete to authenticated
  using (created_by = (select auth.uid()));

create policy features_select on public.features
  for select to anon, authenticated
  using (true);

create policy features_insert on public.features
  for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy features_update on public.features
  for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create policy features_delete on public.features
  for delete to authenticated
  using (created_by = (select auth.uid()));

create policy reports_select on public.reports
  for select to anon, authenticated
  using (true);

create policy reports_insert on public.reports
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy reports_update on public.reports
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy reports_delete on public.reports
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

alter table public.features replica identity full;
alter table public.reports replica identity full;

alter publication supabase_realtime add table public.features;
alter publication supabase_realtime add table public.reports;

-- ---------------------------------------------------------------------------
-- Storage for report photos
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'report-photos',
  'report-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy report_photos_public_read
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'report-photos');

create policy report_photos_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'report-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy report_photos_update_own
on storage.objects
for update
to authenticated
using (
  bucket_id = 'report-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'report-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy report_photos_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'report-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
