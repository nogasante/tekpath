-- Roles, bootstrap, moderation, report hiding, and the approved-only router.
-- Runs inside a transaction the test rolls back. No personal email belongs here.

do $setup$
declare
  v_admin uuid := '00000000-0000-4000-a000-00000000e011';
  v_mod uuid := '00000000-0000-4000-a000-00000000e012';
  v_contrib uuid := '00000000-0000-4000-a000-00000000e013';
  v_guest uuid := '00000000-0000-4000-a000-00000000e014';
  v_magic uuid := '00000000-0000-4000-a000-00000000e015';
  v_pass uuid := '00000000-0000-4000-a000-00000000e016';
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'admin_bootstrap_emails'
  ) then
    raise exception 'bootstrap emails are in the public schema';
  end if;

  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'private' and table_name = 'admin_bootstrap_emails'
  ) then
    raise exception 'private.admin_bootstrap_emails is missing';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token, is_anonymous
  ) values
    ('00000000-0000-0000-0000-000000000000', v_admin, 'authenticated', 'authenticated',
      'admin-bootstrap@tekpath.test', extensions.crypt('AdminUser2026', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Ama Admin"}'::jsonb,
      now(), now(), '', '', '', '', false),
    ('00000000-0000-0000-0000-000000000000', v_mod, 'authenticated', 'authenticated',
      'moderator@tekpath.test', extensions.crypt('ModUser2026', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Kofi Moderator"}'::jsonb,
      now(), now(), '', '', '', '', false),
    ('00000000-0000-0000-0000-000000000000', v_contrib, 'authenticated', 'authenticated',
      'contributor@tekpath.test', extensions.crypt('ContribUser2026', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Abena Contributor"}'::jsonb,
      now(), now(), '', '', '', '', false),
    ('00000000-0000-0000-0000-000000000000', v_guest, 'authenticated', 'authenticated',
      'guest-bootstrap@tekpath.test', extensions.crypt('GuestUser2026', extensions.gen_salt('bf')), now(),
      '{"provider":"anonymous","providers":["anonymous"]}'::jsonb, '{"display_name":"Guest"}'::jsonb,
      now(), now(), '', '', '', '', true),
    ('00000000-0000-0000-0000-000000000000', v_magic, 'authenticated', 'authenticated',
      'magic-bootstrap@tekpath.test', '', null,
      '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Magic Link"}'::jsonb,
      now(), now(), '', '', '', '', false),
    ('00000000-0000-0000-0000-000000000000', v_pass, 'authenticated', 'authenticated',
      'pass-bootstrap@tekpath.test', extensions.crypt('PassUser2026', extensions.gen_salt('bf')), null,
      '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Password Signup"}'::jsonb,
      now(), now(), '', '', '', '', false);

  insert into private.admin_bootstrap_emails (email) values
    ('admin-bootstrap@tekpath.test'),
    ('guest-bootstrap@tekpath.test'),
    ('magic-bootstrap@tekpath.test'),
    ('pass-bootstrap@tekpath.test');

  if (select role from public.user_roles where user_id = v_admin) <> 'admin' then
    raise exception 'confirmed bootstrap email did not grant admin';
  end if;
  if (select role from public.user_roles where user_id = v_guest) <> 'contributor' then
    raise exception 'anonymous guest became admin';
  end if;
  if (select role from public.user_roles where user_id = v_magic) <> 'contributor' then
    raise exception 'unconfirmed magic-link user became admin';
  end if;
  if (select role from public.user_roles where user_id = v_pass) <> 'admin' then
    raise exception 'password sign-up did not match the bootstrap email';
  end if;
  if (select role from public.user_roles where user_id = v_contrib) <> 'contributor' then
    raise exception 'ordinary user was not a contributor';
  end if;
end
$setup$;

set local role anon;

do $anon_lock$
begin
  begin
    perform email from private.admin_bootstrap_emails;
    raise exception 'anon read bootstrap emails';
  exception
    when insufficient_privilege then
      null;
  end;
end
$anon_lock$;

reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-00000000e011', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000e011","role":"authenticated"}', true);
set local role authenticated;

do $admin_roles$
begin
  perform public.admin_set_role('00000000-0000-4000-a000-00000000e012', 'moderator');
  if (select role from public.user_roles where user_id = '00000000-0000-4000-a000-00000000e012') <> 'moderator' then
    raise exception 'admin could not set a moderator';
  end if;

  begin
    perform public.admin_set_role('00000000-0000-4000-a000-00000000e014', 'admin');
    raise exception 'guest was granted admin';
  exception
    when others then
      if sqlerrm not like '%guest%' then
        raise;
      end if;
  end;

  if not exists (
    select 1 from public.admin_find_users('Abena')
    where email = 'contributor@tekpath.test' and role = 'contributor'
  ) then
    raise exception 'admin search did not return the contributor email';
  end if;

  if exists (select 1 from public.admin_find_users('guest-bootstrap') where email like '%guest%') then
    raise exception 'admin search returned an anonymous guest';
  end if;
end
$admin_roles$;

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-00000000e013', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000e013","role":"authenticated"}', true);
set local role authenticated;

do $contributor$
declare
  v_submission uuid := '00000000-0000-4000-a000-00000000e501';
  v_building uuid := '00000000-0000-4000-a000-00000000e101';
  v_floor uuid := '00000000-0000-4000-a000-00000000e111';
  v_node uuid := '00000000-0000-4000-a000-00000000e211';
  v_status text;
begin
  begin
    perform email from private.admin_bootstrap_emails;
    raise exception 'contributor read bootstrap emails';
  exception
    when insufficient_privilege then
      null;
  end;

  begin
    insert into public.user_roles (user_id, role)
    values ('00000000-0000-4000-a000-00000000e013', 'admin');
    raise exception 'contributor wrote user_roles';
  exception
    when insufficient_privilege then
      null;
  end;

  begin
    perform public.admin_set_role('00000000-0000-4000-a000-00000000e013', 'admin');
    raise exception 'contributor changed a role';
  exception
    when others then
      if sqlerrm not like '%admin%' then
        raise;
      end if;
  end;

  begin
    perform public.admin_find_users('Abena');
    raise exception 'contributor looked up emails';
  exception
    when others then
      if sqlerrm not like '%admin%' then
        raise;
      end if;
  end;

  begin
    perform email from auth.users limit 1;
    raise exception 'contributor read auth.users';
  exception
    when insufficient_privilege then
      null;
  end;

  insert into public.buildings (id, name, code, latitude, longitude, status, submission_id)
  values (v_building, 'Moderation Hall', 'MODE1', 6.67, -1.57, 'approved', v_submission);

  select status into v_status from public.buildings where id = v_building;
  if v_status <> 'pending' then
    raise exception 'contributor insert stayed %', v_status;
  end if;

  insert into public.floors (id, building_id, level, name, layout, submission_id)
  values (
    v_floor, v_building, 0, 'Ground',
    '{"frame":"metres","outline":[{"x":0,"y":0},{"x":12,"y":0},{"x":12,"y":8},{"x":0,"y":8}]}'::jsonb,
    v_submission
  );
  insert into public.nodes (id, building_id, floor_id, type, name, latitude, longitude, plan_x, plan_y, step_free, submission_id)
  values (v_node, v_building, v_floor, 'entrance', 'Hall door', 6.67, -1.57, 1, 1, true, v_submission);
end
$contributor$;

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-00000000e013', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000e013","role":"authenticated"}', true);
set local role authenticated;

do $contributor_graph$
declare
  v_submission uuid := '00000000-0000-4000-a000-00000000e501';
  v_other uuid := '00000000-0000-4000-a000-00000000e502';
  v_building uuid := '00000000-0000-4000-a000-00000000e101';
  v_node2 uuid := '00000000-0000-4000-a000-00000000e212';
  v_edge uuid := '00000000-0000-4000-a000-00000000e311';
  v_feature uuid := '00000000-0000-4000-a000-00000000e411';
  v_kept uuid := '00000000-0000-4000-a000-00000000e102';
begin
  if not exists (select 1 from public.buildings where id = v_building and status = 'pending') then
    raise exception 'pending building was not kept for its creator';
  end if;

  insert into public.nodes (id, building_id, floor_id, type, name, latitude, longitude, plan_x, plan_y, step_free, submission_id)
  values (v_node2, v_building, '00000000-0000-4000-a000-00000000e111', 'room', 'Hall room', 6.671, -1.571, 6, 4, true, v_submission);

  insert into public.edges (id, from_node, to_node, type, step_free, length_m, instruction_text, bidirectional, submission_id)
  values (v_edge, '00000000-0000-4000-a000-00000000e211', v_node2, 'corridor', true, 8, 'Walk to the room.', true, v_submission);

  insert into public.features (id, node_id, building_id, kind, name, status, latitude, longitude, submission_id, review_status)
  values (v_feature, '00000000-0000-4000-a000-00000000e211', v_building, 'entrance', 'Hall door', 'working', 6.67, -1.57, v_submission, 'approved');

  if (select review_status from public.features where id = v_feature) <> 'pending' then
    raise exception 'contributor feature was not forced pending';
  end if;
  if (select status from public.edges where id = v_edge) <> 'pending' then
    raise exception 'contributor edge was not forced pending';
  end if;

  update public.buildings set status = 'approved', review_note = 'self approved' where id = v_building;
  if (select status from public.buildings where id = v_building) <> 'pending' then
    raise exception 'contributor updated their own row to approved';
  end if;
  if (select review_note from public.buildings where id = v_building) is not null then
    raise exception 'contributor wrote a review note';
  end if;

  insert into public.buildings (id, name, code, latitude, longitude, submission_id)
  values (v_kept, 'Keep Me Pending', 'MODE2', 6.68, -1.58, v_other);
end
$contributor_graph$;

reset role;
set local role anon;

do $anon_hidden$
begin
  if exists (select 1 from public.buildings where code in ('MODE1', 'MODE2')) then
    raise exception 'anon can see a pending building';
  end if;
  if exists (select 1 from public.features where name = 'Hall door') then
    raise exception 'anon can see a pending map point';
  end if;
end
$anon_hidden$;

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-00000000e012', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000e012","role":"authenticated"}', true);
set local role authenticated;

do $moderator$
declare
  v_submission uuid := '00000000-0000-4000-a000-00000000e501';
  v_other uuid := '00000000-0000-4000-a000-00000000e502';
begin
  begin
    perform public.admin_find_users('Abena');
    raise exception 'moderator looked up emails';
  exception
    when others then
      if sqlerrm not like '%admin%' then
        raise;
      end if;
  end;

  begin
    perform public.admin_set_role('00000000-0000-4000-a000-00000000e013', 'admin');
    raise exception 'moderator changed a role';
  exception
    when others then
      if sqlerrm not like '%admin%' then
        raise;
      end if;
  end;

  if not exists (
    select 1 from public.pending_submissions()
    where submission_id = v_submission and display_name = 'Abena Contributor' and title = 'Moderation Hall'
  ) then
    raise exception 'review queue missed the pending walk';
  end if;

  perform public.review_submission(v_submission, true, 'Looks right');

  if exists (select 1 from public.buildings where id = '00000000-0000-4000-a000-00000000e101' and status <> 'approved') then
    raise exception 'review did not approve the building';
  end if;
  if exists (select 1 from public.floors where submission_id = v_submission and status <> 'approved') then
    raise exception 'review did not approve the floor';
  end if;
  if exists (select 1 from public.nodes where submission_id = v_submission and status <> 'approved') then
    raise exception 'review did not approve a node';
  end if;
  if exists (select 1 from public.edges where submission_id = v_submission and status <> 'approved') then
    raise exception 'review did not approve an edge';
  end if;
  if exists (select 1 from public.features where submission_id = v_submission and review_status <> 'approved') then
    raise exception 'review did not approve the map point';
  end if;
  if (select review_note from public.buildings where id = '00000000-0000-4000-a000-00000000e101') <> 'Looks right' then
    raise exception 'review note was not saved';
  end if;
  if (select status from public.buildings where submission_id = v_other) <> 'pending' then
    raise exception 'review changed a different submission';
  end if;

  perform public.review_submission(v_other, false, 'Please walk it again');
  if (select status from public.buildings where id = '00000000-0000-4000-a000-00000000e102') <> 'rejected' then
    raise exception 'reject did not mark the other building';
  end if;
end
$moderator$;

reset role;
set local role anon;

do $anon_after$
begin
  if not exists (select 1 from public.buildings where code = 'MODE1') then
    raise exception 'anon cannot see an approved building';
  end if;
  if exists (select 1 from public.buildings where code = 'MODE2') then
    raise exception 'anon can see a rejected building';
  end if;
end
$anon_after$;

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-00000000e013', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000e013","role":"authenticated"}', true);
set local role authenticated;

do $creator_rejected$
begin
  if not exists (
    select 1 from public.buildings
    where code = 'MODE2' and status = 'rejected' and review_note = 'Please walk it again'
  ) then
    raise exception 'creator cannot see the rejection note';
  end if;
end
$creator_rejected$;

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);

do $graph$
declare
  v_a uuid := '00000000-0000-4000-a000-00000000e221';
  v_b uuid := '00000000-0000-4000-a000-00000000e222';
  v_c uuid := '00000000-0000-4000-a000-00000000e223';
  v_d uuid := '00000000-0000-4000-a000-00000000e224';
  v_feature uuid := '00000000-0000-4000-a000-00000000e421';
begin
  insert into public.nodes (id, type, name, latitude, longitude, step_free, status)
  values
    (v_a, 'outdoor', 'Route start', 6.10, -1.10, true, 'approved'),
    (v_b, 'outdoor', 'Route end', 6.11, -1.11, true, 'approved'),
    (v_c, 'outdoor', 'Lift start', 6.20, -1.20, true, 'approved'),
    (v_d, 'lift', 'Lift end', 6.21, -1.21, true, 'approved');

  insert into public.features (id, node_id, kind, name, status, review_status, latitude, longitude)
  values (v_feature, v_d, 'lift', 'Test lift', 'working', 'approved', 6.21, -1.21);

  update public.nodes set feature_id = v_feature where id = v_d;

  insert into public.edges (from_node, to_node, type, step_free, length_m, bidirectional, status)
  values (v_c, v_d, 'lift', true, 4, true, 'approved');

  if (select status from public.nodes where id = v_a) <> 'approved' then
    raise exception 'seed insert without a user was not approved';
  end if;
end
$graph$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-00000000e013', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000e013","role":"authenticated"}', true);
set local role authenticated;

do $pending_edge$
declare
  v_route jsonb;
begin
  insert into public.edges (from_node, to_node, type, step_free, length_m, bidirectional, status)
  values (
    '00000000-0000-4000-a000-00000000e221',
    '00000000-0000-4000-a000-00000000e222',
    'path', true, 5, true, 'approved'
  );

  v_route := public.find_step_free_route(
    '00000000-0000-4000-a000-00000000e221',
    '00000000-0000-4000-a000-00000000e222'
  );
  if v_route ->> 'ok' <> 'false' then
    raise exception 'router used a pending edge for its creator';
  end if;
end
$pending_edge$;

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);

do $approved_edge$
declare
  v_route jsonb;
begin
  insert into public.edges (from_node, to_node, type, step_free, length_m, bidirectional, status)
  values (
    '00000000-0000-4000-a000-00000000e221',
    '00000000-0000-4000-a000-00000000e222',
    'path', true, 9, true, 'approved'
  );

  set local role anon;
  v_route := public.find_step_free_route(
    '00000000-0000-4000-a000-00000000e221',
    '00000000-0000-4000-a000-00000000e222'
  );
  if v_route ->> 'ok' <> 'true' then
    raise exception 'approved edge was not routable, %', v_route ->> 'message';
  end if;
end
$approved_edge$;

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-00000000e013', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000e013","role":"authenticated"}', true);
set local role authenticated;

do $reports$
declare
  v_route jsonb;
  v_report uuid;
begin
  insert into public.reports (feature_id, user_id, status, note)
  values (
    '00000000-0000-4000-a000-00000000e421',
    '00000000-0000-4000-a000-00000000e013',
    'broken',
    'moderation-broken-note'
  )
  returning id into v_report;

  if (select status from public.features where id = '00000000-0000-4000-a000-00000000e421') <> 'broken' then
    raise exception 'a live report did not mark the lift broken';
  end if;

  begin
    insert into public.reports (feature_id, user_id, status, note)
    values (
      '00000000-0000-4000-a000-00000000e421',
      '00000000-0000-4000-a000-00000000e013',
      'working',
      'too soon'
    );
    raise exception 'rate limit allowed a second report';
  exception
    when others then
      if sqlerrm not like '%5 minutes%' then
        raise;
      end if;
  end;

  update public.reports set hidden = true where id = v_report;
  if not exists (select 1 from public.report_feed where note = 'moderation-broken-note') then
    raise exception 'the author hid their own report';
  end if;

  reset role;
  set local role anon;
  v_route := public.find_step_free_route(
    '00000000-0000-4000-a000-00000000e223',
    '00000000-0000-4000-a000-00000000e224'
  );
  if v_route ->> 'ok' <> 'false' or v_route ->> 'message' not like '%Test lift%' then
    raise exception 'router ignored a live broken lift, %', v_route ->> 'message';
  end if;
end
$reports$;

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-00000000e012', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000e012","role":"authenticated"}', true);
set local role authenticated;

do $hide$
declare
  v_report uuid;
  v_route jsonb;
begin
  select id into v_report from public.reports where note = 'moderation-broken-note';
  perform public.set_report_hidden(v_report, true);

  if (select status from public.features where id = '00000000-0000-4000-a000-00000000e421') <> 'unknown' then
    raise exception 'hiding the only report did not clear the live status';
  end if;

  if exists (select 1 from public.moderation_reports() where id = v_report and hidden = false) then
    raise exception 'the review list still shows the report as visible';
  end if;

  if exists (
    select 1 from public.moderation_reports()
    where id = v_report and (display_name is null)
  ) then
    raise exception 'the review list dropped the display name';
  end if;

  reset role;
  set local role anon;
  if exists (select 1 from public.report_feed where note = 'moderation-broken-note') then
    raise exception 'a hidden report stayed on the public feed';
  end if;

  v_route := public.find_step_free_route(
    '00000000-0000-4000-a000-00000000e223',
    '00000000-0000-4000-a000-00000000e224'
  );
  if v_route ->> 'ok' <> 'true' then
    raise exception 'router still treated a hidden report as broken, %', v_route ->> 'message';
  end if;
end
$hide$;

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-00000000e013', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000e013","role":"authenticated"}', true);
set local role authenticated;

do $rate_again$
begin
  update public.reports
  set created_at = now() - interval '6 minutes'
  where note = 'moderation-broken-note';

  insert into public.reports (feature_id, user_id, status, note)
  values (
    '00000000-0000-4000-a000-00000000e421',
    '00000000-0000-4000-a000-00000000e013',
    'working',
    'moderation-later-note'
  );
end
$rate_again$;

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-00000000e011', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000e011","role":"authenticated"}', true);
set local role authenticated;

do $last_admin$
begin
  perform public.admin_set_role('00000000-0000-4000-a000-00000000e016', 'contributor');
  begin
    perform public.admin_set_role('00000000-0000-4000-a000-00000000e011', 'contributor');
    raise exception 'the last admin was removed';
  exception
    when others then
      if sqlerrm not like '%at least one admin%' then
        raise;
      end if;
  end;

  insert into public.buildings (name, code, latitude, longitude, status)
  values ('Admin Hall', 'MODE3', 6.69, -1.59, 'pending');
  if (select status from public.buildings where code = 'MODE3') <> 'approved' then
    raise exception 'admin content was not auto-approved';
  end if;
end
$last_admin$;

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-00000000e011', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000e011","role":"authenticated"}', true);
set local role authenticated;

do $claim$
begin
  if public.claim_admin_if_bootstrapped() <> 'admin' then
    raise exception 'claim did not keep the bootstrapped admin';
  end if;
end
$claim$;

reset role;
