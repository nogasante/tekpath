-- Proves mobility needs stay with the owner, and that emails are not readable
-- through the public API roles. Runs inside a transaction the test rolls back.

do $setup$
declare
  v_demo uuid := '00000000-0000-4000-a000-00000000d001';
  v_other uuid := '00000000-0000-4000-a000-00000000d002';
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'mobility_needs'
  ) then
    raise exception 'profiles.mobility_needs is still a public column';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'report_feed'
      and column_name in ('user_id', 'email', 'mobility_needs')
  ) then
    raise exception 'report_feed exposes a private column';
  end if;

  if not has_table_privilege('anon', 'public.profile_private', 'select') then
    raise exception 'anon is missing the required select grant on profile_private';
  end if;

  update public.profile_private
  set mobility_needs = 'PRIVATE-DEMO-NEEDS'
  where id = v_demo;

  if not found then
    raise exception 'demo profile_private row is missing';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_other,
    'authenticated',
    'authenticated',
    'other@tekpath.test',
    extensions.crypt('OtherUser2026', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Kofi Boateng"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, created_at, updated_at
  ) values (
    v_other,
    v_other,
    jsonb_build_object('sub', v_other::text, 'email', 'other@tekpath.test', 'email_verified', true),
    'email',
    v_other::text,
    now(),
    now()
  );

  update public.profile_private
  set mobility_needs = 'PRIVATE-OTHER-NEEDS'
  where id = v_other;

  if (select display_name from public.profiles where id = v_other) <> 'Kofi Boateng' then
    raise exception 'new user display name was not taken from metadata';
  end if;

  if (select display_name from public.profiles where id = v_other) like '%other@tekpath.test%'
     or (select display_name from public.profiles where id = v_other) = 'other' then
    raise exception 'display name leaked the email';
  end if;
end
$setup$;

set local role anon;

do $anon$
begin
  if (select count(*) from public.profile_private) <> 0 then
    raise exception 'anon can read profile_private';
  end if;

  if (select display_name from public.profiles where id = '00000000-0000-4000-a000-00000000d001') <> 'Ama Mensah' then
    raise exception 'anon cannot read the public display name';
  end if;

  if not exists (
    select 1
    from public.report_feed
    where display_name = 'Ama Mensah'
      and note like 'The ramp lip%'
  ) then
    raise exception 'anon cannot read the public report note and display name';
  end if;

  begin
    perform user_id from public.reports limit 1;
    raise exception 'anon selected reports.user_id';
  exception
    when insufficient_privilege then
      null;
  end;

  begin
    perform email from auth.users limit 1;
    raise exception 'anon selected auth.users.email';
  exception
    when insufficient_privilege then
      null;
  end;

  begin
    perform email from auth.identities limit 1;
    raise exception 'anon selected auth.identities';
  exception
    when insufficient_privilege then
      null;
  end;
end
$anon$;

reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-00000000d002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000d002","role":"authenticated"}',
  true
);

set local role authenticated;

do $other$
declare
  v_seen text;
begin
  select string_agg(coalesce(mobility_needs, ''), ' ')
  into v_seen
  from public.profile_private;

  if v_seen like '%PRIVATE-DEMO-NEEDS%' then
    raise exception 'another user read mobility_needs';
  end if;

  if v_seen is distinct from 'PRIVATE-OTHER-NEEDS' then
    raise exception 'another user could not read only their own mobility_needs, saw %', v_seen;
  end if;

  insert into public.reports (feature_id, user_id, status, note)
  values (
    '00000000-0000-4000-a000-000000000301',
    '00000000-0000-4000-a000-00000000d002',
    'broken',
    'privacy-test-note'
  );

  begin
    perform email from auth.users limit 1;
    raise exception 'authenticated selected auth.users.email';
  exception
    when insufficient_privilege then
      null;
  end;

  begin
    perform user_id from public.reports limit 1;
    raise exception 'authenticated selected reports.user_id';
  exception
    when insufficient_privilege then
      null;
  end;
end
$other$;

reset role;

set local role anon;

do $feed$
begin
  if not exists (
    select 1
    from public.report_feed
    where note = 'privacy-test-note'
      and display_name = 'Kofi Boateng'
  ) then
    raise exception 'public report feed hid the note or the display name';
  end if;

  if exists (
    select 1
    from public.report_feed
    where note = 'privacy-test-note'
      and (display_name like '%@%' or display_name like '%PRIVATE-%')
  ) then
    raise exception 'report feed leaked an email or mobility needs';
  end if;
end
$feed$;

reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-00000000d001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000d001","role":"authenticated"}',
  true
);

set local role authenticated;

do $owner$
declare
  v_seen text;
begin
  select string_agg(coalesce(mobility_needs, ''), ' ')
  into v_seen
  from public.profile_private;

  if v_seen is distinct from 'PRIVATE-DEMO-NEEDS' then
    raise exception 'owner could not read their own mobility_needs, saw %', v_seen;
  end if;

  if v_seen like '%PRIVATE-OTHER-NEEDS%' then
    raise exception 'owner read someone else''s mobility_needs';
  end if;
end
$owner$;

reset role;
