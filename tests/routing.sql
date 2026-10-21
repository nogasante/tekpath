-- Runs inside a transaction that the test runner rolls back.
do $$
declare
  v_from uuid;
  v_to uuid;
  v_toilet uuid;
  v_admin uuid;
  v_hall uuid;
  v_lift_a uuid;
  v_lift_b uuid;
  v_user uuid := '00000000-0000-4000-a000-00000000d001';
  r jsonb;
  near jsonb;
begin
  select id into v_from from public.nodes where qr_code = 'ELB-FORECOURT';
  select id into v_to from public.nodes where qr_code = 'ELB-LT201';
  select id into v_toilet from public.nodes where qr_code = 'ELB-TOILET-G';
  select id into v_admin from public.nodes where qr_code = 'ADM-RAMP';
  select id into v_hall from public.nodes where qr_code = 'GH-JUNCTION';
  select id into v_lift_a from public.features where name = 'Lift A';
  select id into v_lift_b from public.features where name = 'Lift B';

  if v_from is null or v_to is null or v_lift_a is null or v_lift_b is null then
    raise exception 'seed nodes or lifts are missing';
  end if;

  if not exists (
    select 1
    from public.edges e
    join public.nodes a on a.id = e.from_node
    join public.nodes b on b.id = e.to_node
    where e.type = 'stairs'
      and e.step_free = false
      and a.qr_code = 'ELB-STAIRS-G'
      and b.qr_code = 'ELB-STAIRS-1'
  ) then
    raise exception 'expected a stair connection in the pilot building';
  end if;

  r := public.find_step_free_route(v_from, v_to);
  if r->>'ok' <> 'true' then
    raise exception 'expected a route via Lift A, got %', r;
  end if;
  if not exists (
    select 1 from jsonb_array_elements(r->'steps') s where s->>'node_name' like 'Lift A%'
  ) then
    raise exception 'route should use Lift A, got %', r;
  end if;
  if exists (
    select 1 from jsonb_array_elements(r->'steps') s where s->>'node_name' like 'Lift B%'
  ) then
    raise exception 'route should not use Lift B while Lift A works, got %', r;
  end if;
  if exists (
    select 1 from jsonb_array_elements(r->'steps') s where coalesce(s->>'edge_type', '') = 'stairs'
  ) then
    raise exception 'route used stairs, got %', r;
  end if;

  insert into public.reports (feature_id, node_id, user_id, status, note)
  values (
    v_lift_a,
    (select id from public.nodes where qr_code = 'ELB-LIFTA-G'),
    v_user,
    'broken',
    'Lift A is stuck between floors'
  );

  if (select status from public.features where id = v_lift_a) <> 'broken' then
    raise exception 'report trigger did not mark Lift A broken';
  end if;

  r := public.find_step_free_route(v_from, v_to);
  if r->>'ok' <> 'true' then
    raise exception 'expected a reroute via Lift B, got %', r;
  end if;
  if not exists (
    select 1 from jsonb_array_elements(r->'steps') s where s->>'node_name' like 'Lift B%'
  ) then
    raise exception 'reroute should use Lift B, got %', r;
  end if;
  if exists (
    select 1 from jsonb_array_elements(r->'steps') s where s->>'node_name' like 'Lift A%'
  ) then
    raise exception 'reroute should avoid broken Lift A, got %', r;
  end if;
  if r::text not like '%Lift B is on your right%' then
    raise exception 'expected the Lift B landmark instruction, got %', r;
  end if;

  insert into public.reports (feature_id, user_id, status, note)
  values (v_lift_b, v_user, 'broken', 'Lift B is out of service too');

  r := public.find_step_free_route(v_from, v_to);
  if r->>'ok' <> 'false' then
    raise exception 'expected no step-free route, got %', r;
  end if;
  if r->>'message' not like 'No step-free route.%Lift A%Lift B%reported broken%' then
    raise exception 'expected an honest blocker message, got %', r->>'message';
  end if;
  if jsonb_array_length(r->'steps') <> 0 then
    raise exception 'a failed route should not invent steps, got %', r;
  end if;

  r := public.find_step_free_route(v_from, v_toilet);
  if r->>'ok' <> 'true' then
    raise exception 'the ground-floor toilet should stay reachable, got %', r;
  end if;

  r := public.find_step_free_route(v_hall, v_admin);
  if r->>'ok' <> 'false' or r->>'message' not like '%Administration Block ramp%' then
    raise exception 'broken admin ramp should be named, got %', r;
  end if;

  near := public.nearest_start_node(6.67552, -1.56870);
  if near->>'qr_code' <> 'ELB-FORECOURT' then
    raise exception 'nearest start should be the ELB forecourt, got %', near;
  end if;
end
$$;
