-- TekPath demo seed.
-- Every coordinate below is an APPROXIMATE demo position near the published
-- KNUST campus centre (6.6745 N, 1.5716 W). They are not a survey.
--
-- Local `supabase db reset` creates demo@tekpath.app here.
-- On a hosted project, create that user with the Auth admin API first
-- (email_confirm true, user_metadata.display_name). Do not rely on the
-- auth.users insert below: GoTrue owns that table and a raw insert is easy
-- to get wrong. If the insert fails, the campus graph still loads, and the
-- profile update and Administration Block report attach only when the
-- demo email already exists.

set search_path = public, extensions, auth;

-- Local demo account. Password: TekpathDemo2026
do $seed_auth$
begin
  if exists (
    select 1 from auth.users
    where id = '00000000-0000-4000-a000-00000000d001'
       or email = 'demo@tekpath.app'
  ) then
    return;
  end if;

  insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  recovery_sent_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-a000-00000000d001',
  'authenticated',
  'authenticated',
  'demo@tekpath.app',
  extensions.crypt('TekpathDemo2026', extensions.gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Ama Mensah"}'::jsonb,
  now(),
  now(),
  '',
  '',
  '',
  ''
);

insert into auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
) values (
  '00000000-0000-4000-a000-00000000d001',
  '00000000-0000-4000-a000-00000000d001',
  jsonb_build_object(
    'sub', '00000000-0000-4000-a000-00000000d001',
    'email', 'demo@tekpath.app',
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  '00000000-0000-4000-a000-00000000d001',
  now(),
  now(),
  now()
);
exception
  when others then
    raise notice 'Skipped auth.users seed (%). Create demo@tekpath.app with the Auth admin API.', sqlerrm;
end
$seed_auth$;

update public.profiles p
set display_name = 'Ama Mensah'
from auth.users u
where u.id = p.id
  and u.email = 'demo@tekpath.app';

insert into public.profile_private (id, mobility_needs)
select u.id, 'Wheelchair user. I need step-free routes and working lifts.'
from auth.users u
where u.email = 'demo@tekpath.app'
on conflict (id) do update
set mobility_needs = excluded.mobility_needs,
    updated_at = now();

insert into public.buildings (id, name, code, description, latitude, longitude) values
  (
    '00000000-0000-4000-a000-0000000000b1',
    'Engineering Lecture Block',
    'ELB',
    'Pilot building with three floors, a ramp entrance, two lifts, and stairs. Indoor positions are a simple diagram, not a measured floor plan. Map pin is approximate.',
    6.67580,
    -1.56870
  ),
  (
    '00000000-0000-4000-a000-0000000000b2',
    'Great Hall',
    'GH',
    'Approximate demo pin near the published campus centre.',
    6.67450,
    -1.57160
  ),
  (
    '00000000-0000-4000-a000-0000000000b3',
    'Main Library',
    'LIB',
    'Approximate demo pin. Not a measured entrance survey.',
    6.67520,
    -1.57040
  ),
  (
    '00000000-0000-4000-a000-0000000000b4',
    'Administration Block',
    'ADM',
    'Approximate demo pin. The ramp is seeded as broken so the map shows a live status.',
    6.67390,
    -1.57240
  ),
  (
    '00000000-0000-4000-a000-0000000000b5',
    'College of Science',
    'SCI',
    'Approximate demo pin near campus centre.',
    6.67610,
    -1.56955
  ),
  (
    '00000000-0000-4000-a000-0000000000b6',
    'Commercial Area',
    'COM',
    'Approximate demo pin for the accessible toilet.',
    6.67315,
    -1.57315
  ),
  (
    '00000000-0000-4000-a000-0000000000b7',
    'Unity Hall',
    'UH',
    'Approximate demo pin. Lift status starts as unknown.',
    6.67260,
    -1.57085
  );

update public.buildings
set footprint = extensions.st_makeenvelope(-1.56892, 6.67562, -1.56848, 6.67598, 4326)
where id = '00000000-0000-4000-a000-0000000000b1';

insert into public.floors (
  id, building_id, level, name, floor_height_m, pressure_hpa_per_m, layout
) values
  (
    '00000000-0000-4000-a000-000000000f00',
    '00000000-0000-4000-a000-0000000000b1',
    0,
    'Ground',
    3.6,
    0.12,
    '{"rooms":[{"name":"Ramp door","x":6,"y":42,"w":16,"h":16},{"name":"Lobby","x":24,"y":40,"w":22,"h":22},{"name":"Lift A","x":46,"y":18,"w":16,"h":16},{"name":"Lift B","x":46,"y":66,"w":16,"h":16},{"name":"Stairs","x":22,"y":8,"w":16,"h":16},{"name":"Lecture Theatre 001","x":70,"y":28,"w":24,"h":22},{"name":"Accessible toilet","x":70,"y":68,"w":24,"h":18}]}'::jsonb
  ),
  (
    '00000000-0000-4000-a000-000000000f01',
    '00000000-0000-4000-a000-0000000000b1',
    1,
    'Level 1',
    3.6,
    0.12,
    '{"rooms":[{"name":"Lift A","x":46,"y":18,"w":16,"h":16},{"name":"Lift B","x":46,"y":66,"w":16,"h":16},{"name":"Stairs","x":22,"y":8,"w":16,"h":16},{"name":"Corridor","x":64,"y":40,"w":14,"h":22},{"name":"Lecture Theatre 101","x":78,"y":16,"w":18,"h":22},{"name":"Lecture Theatre 102","x":78,"y":62,"w":18,"h":22}]}'::jsonb
  ),
  (
    '00000000-0000-4000-a000-000000000f02',
    '00000000-0000-4000-a000-0000000000b1',
    2,
    'Level 2',
    3.6,
    0.12,
    '{"rooms":[{"name":"Lift A","x":46,"y":18,"w":16,"h":16},{"name":"Lift B","x":46,"y":66,"w":16,"h":16},{"name":"Stairs","x":22,"y":8,"w":16,"h":16},{"name":"Corridor","x":64,"y":40,"w":14,"h":22},{"name":"Lecture Theatre 201","x":78,"y":34,"w":18,"h":28}]}'::jsonb
  );

insert into public.nodes (
  id, building_id, floor_id, type, name, landmark_description,
  latitude, longitude, qr_code, step_free, plan_x, plan_y
) values
  ('00000000-0000-4000-a000-000000000201', '00000000-0000-4000-a000-0000000000b2', null, 'outdoor', 'Great Hall junction', 'Open path beside Great Hall. Approximate campus-centre pin.', 6.67450, -1.57160, 'GH-JUNCTION', true, null, null),
  ('00000000-0000-4000-a000-000000000202', '00000000-0000-4000-a000-0000000000b2', null, 'ramp', 'Great Hall ramp', 'Ramp up to the Great Hall entrance.', 6.67462, -1.57142, 'GH-RAMP', true, null, null),
  ('00000000-0000-4000-a000-000000000203', null, null, 'outdoor', 'Accessible parking', 'Marked accessible bays near Great Hall. Approximate.', 6.67418, -1.57212, 'PARK-1', true, null, null),
  ('00000000-0000-4000-a000-000000000204', '00000000-0000-4000-a000-0000000000b3', null, 'entrance', 'Main Library entrance', 'Step-free doors on the library approach. Approximate.', 6.67520, -1.57040, 'LIB-ENT', true, null, null),
  ('00000000-0000-4000-a000-000000000205', '00000000-0000-4000-a000-0000000000b4', null, 'ramp', 'Administration Block ramp', 'Ramp to the administration entrance. Seeded report says the lip is broken.', 6.67390, -1.57240, 'ADM-RAMP', true, null, null),
  ('00000000-0000-4000-a000-000000000206', '00000000-0000-4000-a000-0000000000b6', null, 'toilet', 'Commercial Area accessible toilet', 'Accessible toilet by the commercial area. Approximate.', 6.67315, -1.57315, 'COM-TOILET', true, null, null),
  ('00000000-0000-4000-a000-000000000207', '00000000-0000-4000-a000-0000000000b5', null, 'ramp', 'College of Science ramp', 'Ramp at the College of Science approach. Approximate.', 6.67610, -1.56955, 'SCI-RAMP', true, null, null),
  ('00000000-0000-4000-a000-000000000208', '00000000-0000-4000-a000-0000000000b7', null, 'lift', 'Unity Hall lift', 'Hall lift. Status is unknown until someone reports it. Approximate.', 6.67260, -1.57085, 'UH-LIFT', true, null, null),
  ('00000000-0000-4000-a000-000000000101', '00000000-0000-4000-a000-0000000000b1', null, 'outdoor', 'ELB forecourt', 'Forecourt in front of the Engineering Lecture Block ramp. Approximate.', 6.67552, -1.56870, 'ELB-FORECOURT', true, null, null),
  ('00000000-0000-4000-a000-000000000102', '00000000-0000-4000-a000-0000000000b1', '00000000-0000-4000-a000-000000000f00', 'ramp', 'ELB ramp door', 'Ramp door facing the forecourt. Calibrate the barometer here.', 6.67564, -1.56878, 'ELB-RAMP-G', true, 14, 50),
  ('00000000-0000-4000-a000-000000000103', '00000000-0000-4000-a000-0000000000b1', '00000000-0000-4000-a000-000000000f00', 'junction', 'Ground floor lobby', 'Lobby just inside the ramp door.', 6.67572, -1.56874, 'ELB-LOBBY-G', true, 34, 50),
  ('00000000-0000-4000-a000-000000000104', '00000000-0000-4000-a000-0000000000b1', '00000000-0000-4000-a000-000000000f00', 'lift', 'Lift A, ground', 'Lift A doors on the left side of the lobby.', 6.67578, -1.56864, 'ELB-LIFTA-G', true, 54, 26),
  ('00000000-0000-4000-a000-000000000105', '00000000-0000-4000-a000-0000000000b1', '00000000-0000-4000-a000-000000000f00', 'lift', 'Lift B, ground', 'Lift B doors on the right side of the lobby.', 6.67566, -1.56864, 'ELB-LIFTB-G', true, 54, 74),
  ('00000000-0000-4000-a000-000000000106', '00000000-0000-4000-a000-0000000000b1', '00000000-0000-4000-a000-000000000f00', 'junction', 'Main stairs, ground', 'Stair flight beside the lobby. Not a step-free route.', 6.67584, -1.56880, 'ELB-STAIRS-G', false, 30, 16),
  ('00000000-0000-4000-a000-000000000107', '00000000-0000-4000-a000-0000000000b1', '00000000-0000-4000-a000-000000000f00', 'toilet', 'Accessible toilet, ground', 'Accessible toilet past the lobby, on the right.', 6.67564, -1.56852, 'ELB-TOILET-G', true, 82, 76),
  ('00000000-0000-4000-a000-000000000108', '00000000-0000-4000-a000-0000000000b1', '00000000-0000-4000-a000-000000000f00', 'room', 'Lecture Theatre 001', 'Ground-floor lecture theatre.', 6.67576, -1.56852, 'ELB-LT001', true, 82, 38),
  ('00000000-0000-4000-a000-000000000111', '00000000-0000-4000-a000-0000000000b1', '00000000-0000-4000-a000-000000000f01', 'lift', 'Lift A, level 1', 'Lift A doors on level 1.', 6.67578, -1.56863, 'ELB-LIFTA-1', true, 54, 26),
  ('00000000-0000-4000-a000-000000000112', '00000000-0000-4000-a000-0000000000b1', '00000000-0000-4000-a000-000000000f01', 'lift', 'Lift B, level 1', 'Lift B doors on level 1.', 6.67566, -1.56863, 'ELB-LIFTB-1', true, 54, 74),
  ('00000000-0000-4000-a000-000000000113', '00000000-0000-4000-a000-0000000000b1', '00000000-0000-4000-a000-000000000f01', 'junction', 'Main stairs, level 1', 'Stair landing on level 1.', 6.67584, -1.56879, 'ELB-STAIRS-1', false, 30, 16),
  ('00000000-0000-4000-a000-000000000114', '00000000-0000-4000-a000-0000000000b1', '00000000-0000-4000-a000-000000000f01', 'corridor', 'Level 1 corridor', 'Corridor between the lifts and the lecture theatres.', 6.67572, -1.56856, 'ELB-CORR-1', true, 70, 50),
  ('00000000-0000-4000-a000-000000000115', '00000000-0000-4000-a000-0000000000b1', '00000000-0000-4000-a000-000000000f01', 'room', 'Lecture Theatre 101', 'Lecture theatre on level 1, left side.', 6.67580, -1.56850, 'ELB-LT101', true, 86, 26),
  ('00000000-0000-4000-a000-000000000116', '00000000-0000-4000-a000-0000000000b1', '00000000-0000-4000-a000-000000000f01', 'room', 'Lecture Theatre 102', 'Lecture theatre on level 1, right side.', 6.67564, -1.56850, 'ELB-LT102', true, 86, 72),
  ('00000000-0000-4000-a000-000000000121', '00000000-0000-4000-a000-0000000000b1', '00000000-0000-4000-a000-000000000f02', 'lift', 'Lift A, level 2', 'Lift A doors on level 2.', 6.67578, -1.56862, 'ELB-LIFTA-2', true, 54, 26),
  ('00000000-0000-4000-a000-000000000122', '00000000-0000-4000-a000-0000000000b1', '00000000-0000-4000-a000-000000000f02', 'lift', 'Lift B, level 2', 'Lift B doors on level 2.', 6.67566, -1.56862, 'ELB-LIFTB-2', true, 54, 74),
  ('00000000-0000-4000-a000-000000000123', '00000000-0000-4000-a000-0000000000b1', '00000000-0000-4000-a000-000000000f02', 'junction', 'Main stairs, level 2', 'Stair landing on level 2.', 6.67584, -1.56878, 'ELB-STAIRS-2', false, 30, 16),
  ('00000000-0000-4000-a000-000000000124', '00000000-0000-4000-a000-0000000000b1', '00000000-0000-4000-a000-000000000f02', 'corridor', 'Level 2 corridor', 'Corridor on level 2 between the lifts and Lecture Theatre 201.', 6.67572, -1.56855, 'ELB-CORR-2', true, 70, 50),
  ('00000000-0000-4000-a000-000000000125', '00000000-0000-4000-a000-0000000000b1', '00000000-0000-4000-a000-000000000f02', 'room', 'Lecture Theatre 201', 'Level 2 lecture theatre, on the left of the corridor.', 6.67574, -1.56848, 'ELB-LT201', true, 86, 46);

insert into public.features (
  id, node_id, building_id, kind, name, status, latitude, longitude
) values
  ('00000000-0000-4000-a000-000000000301', '00000000-0000-4000-a000-000000000104', '00000000-0000-4000-a000-0000000000b1', 'lift', 'Lift A', 'working', 6.67578, -1.56864),
  ('00000000-0000-4000-a000-000000000302', '00000000-0000-4000-a000-000000000105', '00000000-0000-4000-a000-0000000000b1', 'lift', 'Lift B', 'working', 6.67566, -1.56864),
  ('00000000-0000-4000-a000-000000000303', '00000000-0000-4000-a000-000000000102', '00000000-0000-4000-a000-0000000000b1', 'ramp', 'ELB entrance ramp', 'working', 6.67564, -1.56878),
  ('00000000-0000-4000-a000-000000000304', '00000000-0000-4000-a000-000000000107', '00000000-0000-4000-a000-0000000000b1', 'toilet', 'ELB accessible toilet', 'working', 6.67564, -1.56852),
  ('00000000-0000-4000-a000-000000000305', '00000000-0000-4000-a000-000000000202', '00000000-0000-4000-a000-0000000000b2', 'ramp', 'Great Hall ramp', 'working', 6.67462, -1.57142),
  ('00000000-0000-4000-a000-000000000306', '00000000-0000-4000-a000-000000000203', null, 'parking', 'Great Hall accessible parking', 'working', 6.67418, -1.57212),
  ('00000000-0000-4000-a000-000000000307', '00000000-0000-4000-a000-000000000204', '00000000-0000-4000-a000-0000000000b3', 'entrance', 'Main Library step-free entrance', 'working', 6.67520, -1.57040),
  ('00000000-0000-4000-a000-000000000308', '00000000-0000-4000-a000-000000000205', '00000000-0000-4000-a000-0000000000b4', 'ramp', 'Administration Block ramp', 'working', 6.67390, -1.57240),
  ('00000000-0000-4000-a000-000000000309', '00000000-0000-4000-a000-000000000206', '00000000-0000-4000-a000-0000000000b6', 'toilet', 'Commercial Area accessible toilet', 'working', 6.67315, -1.57315),
  ('00000000-0000-4000-a000-000000000310', '00000000-0000-4000-a000-000000000207', '00000000-0000-4000-a000-0000000000b5', 'ramp', 'College of Science ramp', 'working', 6.67610, -1.56955),
  ('00000000-0000-4000-a000-000000000311', '00000000-0000-4000-a000-000000000208', '00000000-0000-4000-a000-0000000000b7', 'lift', 'Unity Hall lift', 'unknown', 6.67260, -1.57085);

update public.nodes set feature_id = '00000000-0000-4000-a000-000000000301'
where qr_code in ('ELB-LIFTA-G', 'ELB-LIFTA-1', 'ELB-LIFTA-2');
update public.nodes set feature_id = '00000000-0000-4000-a000-000000000302'
where qr_code in ('ELB-LIFTB-G', 'ELB-LIFTB-1', 'ELB-LIFTB-2');
update public.nodes set feature_id = '00000000-0000-4000-a000-000000000303' where qr_code = 'ELB-RAMP-G';
update public.nodes set feature_id = '00000000-0000-4000-a000-000000000304' where qr_code = 'ELB-TOILET-G';
update public.nodes set feature_id = '00000000-0000-4000-a000-000000000305' where qr_code = 'GH-RAMP';
update public.nodes set feature_id = '00000000-0000-4000-a000-000000000306' where qr_code = 'PARK-1';
update public.nodes set feature_id = '00000000-0000-4000-a000-000000000307' where qr_code = 'LIB-ENT';
update public.nodes set feature_id = '00000000-0000-4000-a000-000000000308' where qr_code = 'ADM-RAMP';
update public.nodes set feature_id = '00000000-0000-4000-a000-000000000309' where qr_code = 'COM-TOILET';
update public.nodes set feature_id = '00000000-0000-4000-a000-000000000310' where qr_code = 'SCI-RAMP';
update public.nodes set feature_id = '00000000-0000-4000-a000-000000000311' where qr_code = 'UH-LIFT';

insert into public.edges (
  from_node, to_node, type, step_free, length_m, bidirectional, instruction_text, reverse_instruction_text
) values
  ('00000000-0000-4000-a000-000000000201', '00000000-0000-4000-a000-000000000101', 'path', true, 480, true,
    'Follow the campus path toward the Engineering Lecture Block. This outdoor line is approximate.',
    'Follow the campus path back toward Great Hall. This outdoor line is approximate.'),
  ('00000000-0000-4000-a000-000000000201', '00000000-0000-4000-a000-000000000203', 'path', true, 70, true,
    'The accessible parking bays are ahead.',
    'Return to the Great Hall junction.'),
  ('00000000-0000-4000-a000-000000000201', '00000000-0000-4000-a000-000000000202', 'ramp', true, 12, true,
    'Take the Great Hall ramp to the entrance.',
    'Leave by the Great Hall ramp.'),
  ('00000000-0000-4000-a000-000000000201', '00000000-0000-4000-a000-000000000204', 'path', true, 180, true,
    'Follow the path to the Main Library entrance.',
    'Follow the path back toward Great Hall.'),
  ('00000000-0000-4000-a000-000000000201', '00000000-0000-4000-a000-000000000205', 'ramp', true, 140, true,
    'The Administration Block ramp is ahead.',
    'Leave the Administration Block by the ramp.'),
  ('00000000-0000-4000-a000-000000000201', '00000000-0000-4000-a000-000000000206', 'path', true, 220, true,
    'Follow the path to the Commercial Area accessible toilet.',
    'Follow the path back toward Great Hall.'),
  ('00000000-0000-4000-a000-000000000204', '00000000-0000-4000-a000-000000000207', 'ramp', true, 160, true,
    'Take the College of Science ramp.',
    'Leave the College of Science by the ramp.'),
  ('00000000-0000-4000-a000-000000000201', '00000000-0000-4000-a000-000000000208', 'lift', true, 260, true,
    'Unity Hall lift is along this path.',
    'Leave Unity Hall lift and follow the path toward Great Hall.'),
  ('00000000-0000-4000-a000-000000000101', '00000000-0000-4000-a000-000000000102', 'ramp', true, 8, true,
    'Follow the forecourt to the ramp door.',
    'Go out through the ramp door onto the forecourt.'),
  ('00000000-0000-4000-a000-000000000101', '00000000-0000-4000-a000-000000000106', 'stairs', false, 6, true,
    'The stepped entrance is ahead.',
    'The steps lead back to the forecourt.'),
  ('00000000-0000-4000-a000-000000000102', '00000000-0000-4000-a000-000000000103', 'corridor', true, 6, true,
    'Go through the ramp door into the ground-floor lobby.',
    'The ramp door leads back out to the forecourt.'),
  ('00000000-0000-4000-a000-000000000103', '00000000-0000-4000-a000-000000000104', 'corridor', true, 8, true,
    'Lift A is on your left.',
    'Return to the lobby from Lift A.'),
  ('00000000-0000-4000-a000-000000000103', '00000000-0000-4000-a000-000000000105', 'corridor', true, 16, true,
    'Go through the ramp door; Lift B is on your right.',
    'Return to the lobby from Lift B.'),
  ('00000000-0000-4000-a000-000000000103', '00000000-0000-4000-a000-000000000106', 'corridor', true, 10, true,
    'The main stairs are ahead.',
    'Return to the lobby from the stairs.'),
  ('00000000-0000-4000-a000-000000000103', '00000000-0000-4000-a000-000000000107', 'corridor', true, 12, true,
    'The accessible toilet is on your right, past the lobby.',
    'Return to the lobby from the accessible toilet.'),
  ('00000000-0000-4000-a000-000000000103', '00000000-0000-4000-a000-000000000108', 'corridor', true, 18, true,
    'Lecture Theatre 001 is ahead on the ground floor.',
    'Leave Lecture Theatre 001 and return to the lobby.'),
  ('00000000-0000-4000-a000-000000000104', '00000000-0000-4000-a000-000000000111', 'lift', true, 4, true,
    'Take Lift A up to level 1.',
    'Take Lift A down to the ground floor.'),
  ('00000000-0000-4000-a000-000000000111', '00000000-0000-4000-a000-000000000121', 'lift', true, 4, true,
    'Take Lift A up to level 2. Step out when the doors open.',
    'Take Lift A down to level 1.'),
  ('00000000-0000-4000-a000-000000000105', '00000000-0000-4000-a000-000000000112', 'lift', true, 4, true,
    'Take Lift B up to level 1.',
    'Take Lift B down to the ground floor.'),
  ('00000000-0000-4000-a000-000000000112', '00000000-0000-4000-a000-000000000122', 'lift', true, 4, true,
    'Take Lift B up to level 2. Step out when the doors open.',
    'Take Lift B down to level 1.'),
  ('00000000-0000-4000-a000-000000000106', '00000000-0000-4000-a000-000000000113', 'stairs', false, 4, true,
    'Climb the stairs to level 1.',
    'Go down the stairs to the ground floor.'),
  ('00000000-0000-4000-a000-000000000113', '00000000-0000-4000-a000-000000000123', 'stairs', false, 4, true,
    'Climb the stairs to level 2.',
    'Go down the stairs to level 1.'),
  ('00000000-0000-4000-a000-000000000111', '00000000-0000-4000-a000-000000000114', 'corridor', true, 6, true,
    'Leave Lift A. The level 1 corridor is ahead.',
    'Lift A is ahead.'),
  ('00000000-0000-4000-a000-000000000112', '00000000-0000-4000-a000-000000000114', 'corridor', true, 12, true,
    'Leave Lift B and follow the corridor.',
    'Lift B is at the end of the corridor, on your right.'),
  ('00000000-0000-4000-a000-000000000113', '00000000-0000-4000-a000-000000000114', 'corridor', true, 8, true,
    'The level 1 corridor is ahead of the stairs.',
    'The stairs are at the end of the corridor.'),
  ('00000000-0000-4000-a000-000000000114', '00000000-0000-4000-a000-000000000115', 'corridor', true, 8, true,
    'Lecture Theatre 101 is on your left.',
    'Leave Lecture Theatre 101 and return to the corridor.'),
  ('00000000-0000-4000-a000-000000000114', '00000000-0000-4000-a000-000000000116', 'corridor', true, 10, true,
    'Lecture Theatre 102 is on your right.',
    'Leave Lecture Theatre 102 and return to the corridor.'),
  ('00000000-0000-4000-a000-000000000121', '00000000-0000-4000-a000-000000000124', 'corridor', true, 5, true,
    'Leave Lift A. The level 2 corridor is straight ahead.',
    'Lift A is straight ahead.'),
  ('00000000-0000-4000-a000-000000000122', '00000000-0000-4000-a000-000000000124', 'corridor', true, 14, true,
    'Leave Lift B and follow the corridor to the middle of the floor.',
    'Lift B is at the end of the corridor, on your right.'),
  ('00000000-0000-4000-a000-000000000123', '00000000-0000-4000-a000-000000000124', 'corridor', true, 9, true,
    'The level 2 corridor is ahead of the stairs.',
    'The stairs are along the corridor.'),
  ('00000000-0000-4000-a000-000000000124', '00000000-0000-4000-a000-000000000125', 'corridor', true, 8, true,
    'Lecture Theatre 201 is on your left.',
    'Leave Lecture Theatre 201 and return to the corridor.');

insert into public.reports (feature_id, node_id, user_id, status, note)
select
  '00000000-0000-4000-a000-000000000308',
  '00000000-0000-4000-a000-000000000205',
  u.id,
  'broken',
  'The ramp lip has crumbled and a wheelchair cannot cross it. This pin is approximate — please confirm on site.'
from auth.users u
where u.email = 'demo@tekpath.app'
  and not exists (
    select 1
    from public.reports r
    where r.feature_id = '00000000-0000-4000-a000-000000000308'
      and r.note = 'The ramp lip has crumbled and a wheelchair cannot cross it. This pin is approximate — please confirm on site.'
  );
