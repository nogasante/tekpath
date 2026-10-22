-- Roles, first-admin bootstrap, and moderation for buildings, floors, nodes,
-- edges, and map points. Reports stay live. features.status remains
-- working / broken / unknown; moderation for a map point is review_status.

-- ---------------------------------------------------------------------------
-- Roles. Users cannot write this table. admin_set_role is the only writer.
-- ---------------------------------------------------------------------------

create table public.user_roles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  role text not null default 'contributor',
  updated_at timestamptz not null default now(),
  constraint user_roles_role_chk check (role in ('admin', 'moderator', 'contributor'))
);

comment on table public.user_roles is
  'Campus role for auth.uid(). A missing row means contributor. Writes go through admin_set_role.';

insert into public.user_roles (user_id, role)
select id, 'contributor'
from public.profiles
on conflict (user_id) do nothing;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and role = 'admin'
  );
$$;

create or replace function private.is_moderator_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and role in ('admin', 'moderator')
  );
$$;

revoke all on function private.is_admin() from public;
revoke all on function private.is_moderator_or_admin() from public;
grant execute on function private.is_admin() to anon, authenticated, service_role;
grant execute on function private.is_moderator_or_admin() to anon, authenticated, service_role;

alter table public.user_roles enable row level security;

create policy user_roles_select on public.user_roles
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.is_moderator_or_admin())
  );

revoke all on table public.user_roles from public, anon, authenticated;
grant select on table public.user_roles to authenticated;
grant select, insert, update, delete on table public.user_roles to service_role;

-- ---------------------------------------------------------------------------
-- First admin. The email list lives in private and is not an API table.
-- Insert the address on the hosted database. Nothing personal belongs in git.
-- ---------------------------------------------------------------------------

create table private.admin_bootstrap_emails (
  email text primary key,
  constraint admin_bootstrap_emails_len check (char_length(email) between 3 and 320)
);

comment on table private.admin_bootstrap_emails is
  'Emails that become admin on sign-up or when the row is inserted. Not exposed to the API.';

revoke all on table private.admin_bootstrap_emails from public, anon, authenticated;

create or replace function private.grant_bootstrap_admin(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_anonymous boolean;
  v_confirmed timestamptz;
  v_password text;
begin
  if p_user is null then
    return;
  end if;

  select u.email, coalesce(u.is_anonymous, false), u.email_confirmed_at, u.encrypted_password
  into v_email, v_anonymous, v_confirmed, v_password
  from auth.users u
  where u.id = p_user;

  if not found or v_anonymous or v_email is null or btrim(v_email) = '' then
    return;
  end if;

  -- Confirmed address, or the email on a password sign-up (password is already stored).
  if v_confirmed is null and coalesce(v_password, '') = '' then
    return;
  end if;

  if not exists (
    select 1
    from private.admin_bootstrap_emails b
    where lower(b.email) = lower(v_email)
  ) then
    return;
  end if;

  insert into public.user_roles (user_id, role)
  values (p_user, 'admin')
  on conflict (user_id) do update
  set role = 'admin',
      updated_at = now();
end;
$$;

create or replace function private.apply_admin_bootstrap_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  for v_user in
    select u.id
    from auth.users u
    where u.email is not null
      and lower(u.email) = lower(new.email)
  loop
    perform private.grant_bootstrap_admin(v_user);
  end loop;
  return new;
end;
$$;

create trigger admin_bootstrap_emails_apply
after insert on private.admin_bootstrap_emails
for each row execute function private.apply_admin_bootstrap_email();

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
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      case when coalesce(new.is_anonymous, false) then 'Guest' else null end,
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Student'
    )
  )
  on conflict (id) do nothing;

  insert into public.profile_private (id)
  values (new.id)
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'contributor')
  on conflict (user_id) do nothing;

  perform private.grant_bootstrap_admin(new.id);
  return new;
end;
$$;

create or replace function public.claim_admin_if_bootstrapped()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if (select auth.uid()) is null then
    return 'contributor';
  end if;

  perform private.grant_bootstrap_admin((select auth.uid()));

  select ur.role into v_role
  from public.user_roles ur
  where ur.user_id = (select auth.uid());

  return coalesce(v_role, 'contributor');
end;
$$;

create or replace function public.admin_set_role(target_user uuid, role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anonymous boolean;
  v_admins integer;
begin
  if not private.is_admin() then
    raise exception 'Only an admin can change roles.';
  end if;

  if admin_set_role.role is null or admin_set_role.role not in ('admin', 'moderator', 'contributor') then
    raise exception 'Choose admin, moderator, or contributor.';
  end if;

  if target_user is null or not exists (select 1 from public.profiles where id = target_user) then
    raise exception 'That person does not have an account yet.';
  end if;

  select coalesce(u.is_anonymous, false) into v_anonymous
  from auth.users u
  where u.id = target_user;

  if coalesce(v_anonymous, false) and admin_set_role.role in ('admin', 'moderator') then
    raise exception 'A guest cannot be an admin or a moderator.';
  end if;

  if admin_set_role.role <> 'admin'
     and exists (select 1 from public.user_roles ur where ur.user_id = target_user and ur.role = 'admin')
  then
    select count(*) into v_admins from public.user_roles where user_roles.role = 'admin';
    if v_admins <= 1 then
      raise exception 'Keep at least one admin.';
    end if;
  end if;

  insert into public.user_roles (user_id, role)
  values (target_user, admin_set_role.role)
  on conflict (user_id) do update
  set role = excluded.role,
      updated_at = now();
end;
$$;

create or replace function public.admin_find_users(query text)
returns table (
  user_id uuid,
  display_name text,
  email text,
  role text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_query text := left(btrim(coalesce(query, '')), 80);
begin
  if not private.is_admin() then
    raise exception 'Only an admin can look up accounts.';
  end if;

  if char_length(v_query) < 2 then
    raise exception 'Type at least two letters of a name or an email.';
  end if;

  return query
  select
    p.id,
    p.display_name,
    u.email::text,
    coalesce(ur.role, 'contributor')
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.user_roles ur on ur.user_id = p.id
  where coalesce(u.is_anonymous, false) = false
    and (
      p.display_name ilike '%' || v_query || '%'
      or u.email ilike '%' || v_query || '%'
    )
  order by p.display_name, u.email
  limit 25;
end;
$$;

revoke all on function private.grant_bootstrap_admin(uuid) from public, anon, authenticated;
revoke all on function private.apply_admin_bootstrap_email() from public, anon, authenticated;
revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function public.claim_admin_if_bootstrapped() from public;
revoke all on function public.admin_set_role(uuid, text) from public;
revoke all on function public.admin_find_users(text) from public;

grant execute on function private.grant_bootstrap_admin(uuid) to postgres, service_role;
grant execute on function private.apply_admin_bootstrap_email() to postgres, service_role;
grant execute on function private.handle_new_user() to supabase_auth_admin, postgres, service_role;
grant execute on function public.claim_admin_if_bootstrapped() to authenticated, service_role;
grant execute on function public.admin_set_role(uuid, text) to authenticated, service_role;
grant execute on function public.admin_find_users(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Moderation columns. Existing rows stay approved so the campus graph remains live.
-- ---------------------------------------------------------------------------

alter table public.buildings
  add column status text not null default 'approved',
  add column reviewed_by uuid references public.profiles (id) on delete set null,
  add column reviewed_at timestamptz,
  add column review_note text,
  add column submission_id uuid,
  add constraint buildings_review_status_chk check (status in ('pending', 'approved', 'rejected')),
  add constraint buildings_review_note_len check (review_note is null or char_length(review_note) <= 500);

alter table public.floors
  add column status text not null default 'approved',
  add column reviewed_by uuid references public.profiles (id) on delete set null,
  add column reviewed_at timestamptz,
  add column review_note text,
  add column submission_id uuid,
  add constraint floors_review_status_chk check (status in ('pending', 'approved', 'rejected')),
  add constraint floors_review_note_len check (review_note is null or char_length(review_note) <= 500);

alter table public.nodes
  add column status text not null default 'approved',
  add column reviewed_by uuid references public.profiles (id) on delete set null,
  add column reviewed_at timestamptz,
  add column review_note text,
  add column submission_id uuid,
  add constraint nodes_review_status_chk check (status in ('pending', 'approved', 'rejected')),
  add constraint nodes_review_note_len check (review_note is null or char_length(review_note) <= 500);

alter table public.edges
  add column status text not null default 'approved',
  add column reviewed_by uuid references public.profiles (id) on delete set null,
  add column reviewed_at timestamptz,
  add column review_note text,
  add column submission_id uuid,
  add constraint edges_review_status_chk check (status in ('pending', 'approved', 'rejected')),
  add constraint edges_review_note_len check (review_note is null or char_length(review_note) <= 500);

alter table public.features
  add column review_status text not null default 'approved',
  add column reviewed_by uuid references public.profiles (id) on delete set null,
  add column reviewed_at timestamptz,
  add column review_note text,
  add column submission_id uuid,
  add constraint features_review_status_chk check (review_status in ('pending', 'approved', 'rejected')),
  add constraint features_review_note_len check (review_note is null or char_length(review_note) <= 500);

comment on column public.features.status is
  'Live condition from reports: working, broken, or unknown.';

comment on column public.features.review_status is
  'Moderation state for this map point. Separate from working, broken, and unknown.';

create index buildings_review_status_idx on public.buildings (status);
create index floors_review_status_idx on public.floors (status);
create index nodes_review_status_idx on public.nodes (status);
create index edges_review_status_idx on public.edges (status);
create index features_review_status_idx on public.features (review_status);
create index buildings_submission_idx on public.buildings (submission_id) where submission_id is not null;
create index floors_submission_idx on public.floors (submission_id) where submission_id is not null;
create index nodes_submission_idx on public.nodes (submission_id) where submission_id is not null;
create index edges_submission_idx on public.edges (submission_id) where submission_id is not null;
create index features_submission_idx on public.features (submission_id) where submission_id is not null;

create or replace function private.stamp_moderation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if (select auth.uid()) is null then
      if tg_table_name = 'features' then
        if new.review_status is null then
          new.review_status := 'approved';
        end if;
      elsif new.status is null then
        new.status := 'approved';
      end if;
      return new;
    end if;

    if private.is_admin() then
      if tg_table_name = 'features' then
        new.review_status := 'approved';
      else
        new.status := 'approved';
      end if;
      new.reviewed_by := (select auth.uid());
      new.reviewed_at := now();
      return new;
    end if;

    if tg_table_name = 'features' then
      new.review_status := 'pending';
    else
      new.status := 'pending';
    end if;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
    return new;
  end if;

  -- Seeds and maintenance have no user. Admins are trusted. The review RPC sets the GUC.
  if (select auth.uid()) is null
     or current_setting('tekpath.reviewing', true) = '1'
     or private.is_admin()
  then
    return new;
  end if;

  if tg_table_name = 'features' then
    new.review_status := old.review_status;
  else
    new.status := old.status;
  end if;
  new.reviewed_by := old.reviewed_by;
  new.reviewed_at := old.reviewed_at;
  new.review_note := old.review_note;
  new.submission_id := old.submission_id;
  return new;
end;
$$;

create trigger buildings_stamp_moderation
before insert or update on public.buildings
for each row execute function private.stamp_moderation();

create trigger floors_stamp_moderation
before insert or update on public.floors
for each row execute function private.stamp_moderation();

create trigger nodes_stamp_moderation
before insert or update on public.nodes
for each row execute function private.stamp_moderation();

create trigger edges_stamp_moderation
before insert or update on public.edges
for each row execute function private.stamp_moderation();

create trigger features_stamp_moderation
before insert or update on public.features
for each row execute function private.stamp_moderation();

revoke all on function private.stamp_moderation() from public, anon;
grant execute on function private.stamp_moderation() to authenticated, service_role, postgres;

-- Public reads see approved rows. The creator also sees their own. Reviewers see all.
drop policy buildings_select on public.buildings;
create policy buildings_select on public.buildings
  for select to anon, authenticated
  using (
    status = 'approved'
    or created_by = (select auth.uid())
    or (select private.is_moderator_or_admin())
  );

drop policy floors_select on public.floors;
create policy floors_select on public.floors
  for select to anon, authenticated
  using (
    status = 'approved'
    or created_by = (select auth.uid())
    or (select private.is_moderator_or_admin())
  );

drop policy nodes_select on public.nodes;
create policy nodes_select on public.nodes
  for select to anon, authenticated
  using (
    status = 'approved'
    or created_by = (select auth.uid())
    or (select private.is_moderator_or_admin())
  );

drop policy edges_select on public.edges;
create policy edges_select on public.edges
  for select to anon, authenticated
  using (
    status = 'approved'
    or created_by = (select auth.uid())
    or (select private.is_moderator_or_admin())
  );

drop policy features_select on public.features;
create policy features_select on public.features
  for select to anon, authenticated
  using (
    review_status = 'approved'
    or created_by = (select auth.uid())
    or (select private.is_moderator_or_admin())
  );

drop policy buildings_update on public.buildings;
create policy buildings_update on public.buildings
  for update to authenticated
  using (created_by = (select auth.uid()) or (select private.is_admin()))
  with check (created_by = (select auth.uid()) or (select private.is_admin()));

drop policy floors_update on public.floors;
create policy floors_update on public.floors
  for update to authenticated
  using (created_by = (select auth.uid()) or (select private.is_admin()))
  with check (created_by = (select auth.uid()) or (select private.is_admin()));

drop policy nodes_update on public.nodes;
create policy nodes_update on public.nodes
  for update to authenticated
  using (created_by = (select auth.uid()) or (select private.is_admin()))
  with check (created_by = (select auth.uid()) or (select private.is_admin()));

drop policy edges_update on public.edges;
create policy edges_update on public.edges
  for update to authenticated
  using (created_by = (select auth.uid()) or (select private.is_admin()))
  with check (created_by = (select auth.uid()) or (select private.is_admin()));

drop policy features_update on public.features;
create policy features_update on public.features
  for update to authenticated
  using (created_by = (select auth.uid()) or (select private.is_admin()))
  with check (created_by = (select auth.uid()) or (select private.is_admin()));

drop policy buildings_delete on public.buildings;
create policy buildings_delete on public.buildings
  for delete to authenticated
  using (created_by = (select auth.uid()) or (select private.is_admin()));

drop policy floors_delete on public.floors;
create policy floors_delete on public.floors
  for delete to authenticated
  using (created_by = (select auth.uid()) or (select private.is_admin()));

drop policy nodes_delete on public.nodes;
create policy nodes_delete on public.nodes
  for delete to authenticated
  using (created_by = (select auth.uid()) or (select private.is_admin()));

drop policy edges_delete on public.edges;
create policy edges_delete on public.edges
  for delete to authenticated
  using (created_by = (select auth.uid()) or (select private.is_admin()));

drop policy features_delete on public.features;
create policy features_delete on public.features
  for delete to authenticated
  using (created_by = (select auth.uid()) or (select private.is_admin()));

create or replace function public.review_submission(submission_id uuid, approve boolean, note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_note text;
begin
  if not private.is_moderator_or_admin() then
    raise exception 'Only a moderator can review a map.';
  end if;

  if submission_id is null then
    raise exception 'Choose a map to review.';
  end if;

  v_note := nullif(btrim(coalesce(note, '')), '');
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'Keep the note under 500 characters.';
  end if;

  if not exists (
    select 1 from public.buildings where buildings.submission_id = review_submission.submission_id
    union all
    select 1 from public.floors where floors.submission_id = review_submission.submission_id
    union all
    select 1 from public.nodes where nodes.submission_id = review_submission.submission_id
    union all
    select 1 from public.edges where edges.submission_id = review_submission.submission_id
    union all
    select 1 from public.features where features.submission_id = review_submission.submission_id
  ) then
    raise exception 'That map is no longer waiting.';
  end if;

  v_status := case when approve then 'approved' else 'rejected' end;
  perform set_config('tekpath.reviewing', '1', true);

  update public.buildings
  set status = v_status, reviewed_by = (select auth.uid()), reviewed_at = now(), review_note = v_note
  where buildings.submission_id = review_submission.submission_id;

  update public.floors
  set status = v_status, reviewed_by = (select auth.uid()), reviewed_at = now(), review_note = v_note
  where floors.submission_id = review_submission.submission_id;

  update public.nodes
  set status = v_status, reviewed_by = (select auth.uid()), reviewed_at = now(), review_note = v_note
  where nodes.submission_id = review_submission.submission_id;

  update public.edges
  set status = v_status, reviewed_by = (select auth.uid()), reviewed_at = now(), review_note = v_note
  where edges.submission_id = review_submission.submission_id;

  update public.features
  set review_status = v_status, reviewed_by = (select auth.uid()), reviewed_at = now(), review_note = v_note
  where features.submission_id = review_submission.submission_id;
end;
$$;

create or replace function public.pending_submissions()
returns table (
  submission_id uuid,
  title text,
  display_name text,
  created_at timestamptz,
  place_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not private.is_moderator_or_admin() then
    raise exception 'Only a moderator can review a map.';
  end if;

  return query
  with pieces as (
    select b.submission_id, b.name as label, b.created_by, b.created_at, 3 as weight, 'building' as kind
    from public.buildings b
    where b.status = 'pending' and b.submission_id is not null
    union all
    select f.submission_id, f.name, f.created_by, f.created_at, 1, 'floor'
    from public.floors f
    where f.status = 'pending' and f.submission_id is not null
    union all
    select n.submission_id, n.name, n.created_by, n.created_at, 2, 'node'
    from public.nodes n
    where n.status = 'pending' and n.submission_id is not null
    union all
    select e.submission_id, null::text, e.created_by, e.created_at, 0, 'edge'
    from public.edges e
    where e.status = 'pending' and e.submission_id is not null
    union all
    select ft.submission_id, ft.name, ft.created_by, ft.created_at, 2, 'feature'
    from public.features ft
    where ft.review_status = 'pending' and ft.submission_id is not null
  ),
  grouped as (
    select
      p.submission_id,
      (array_agg(p.label order by p.weight desc, p.created_at) filter (where p.label is not null))[1] as title,
      (array_agg(p.created_by order by p.created_at) filter (where p.created_by is not null))[1] as created_by,
      min(p.created_at) as created_at,
      case
        when count(*) filter (where p.kind in ('node', 'feature')) > 0
          then count(*) filter (where p.kind in ('node', 'feature'))
        else 1
      end::integer as place_count
    from pieces p
    group by p.submission_id
  )
  select
    g.submission_id,
    g.title,
    pr.display_name,
    g.created_at,
    g.place_count
  from grouped g
  left join public.profiles pr on pr.id = g.created_by
  order by g.created_at;
end;
$$;

revoke all on function public.review_submission(uuid, boolean, text) from public;
revoke all on function public.pending_submissions() from public;
grant execute on function public.review_submission(uuid, boolean, text) to authenticated, service_role;
grant execute on function public.pending_submissions() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Router: approved nodes and edges only, even when the caller can see their own drafts.
-- ---------------------------------------------------------------------------

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
    and e.status = 'approved'
    and e.type in ('lift', 'ramp')
    and f.status = 'broken'
    and f.review_status = 'approved';
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
      join public.nodes nf on nf.id = e.from_node and nf.status = 'approved'
      join public.nodes nt on nt.id = e.to_node and nt.status = 'approved'
      where e.step_free
        and e.type <> 'stairs'
        and e.status = 'approved'
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

  if not exists (select 1 from public.nodes where id = p_from and status = 'approved') then
    return jsonb_build_object(
      'ok', false,
      'message', 'The start point is not on the TekPath map.',
      'distance_m', null,
      'steps', '[]'::jsonb,
      'blockers', '[]'::jsonb
    );
  end if;

  if not exists (select 1 from public.nodes where id = p_to and status = 'approved') then
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
  where status = 'broken'
    and review_status = 'approved';

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
    and n.status = 'approved'
    and (n.building_id is null or b.status = 'approved')
    and (n.floor_id is null or f.status = 'approved')
  order by n.geom <-> extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)
  limit 1;
$$;

comment on function public.find_step_free_route(uuid, uuid) is
  'Step-free Dijkstra route. Uses approved nodes and edges only, and excludes stairs plus any approved lift or ramp whose live status is broken.';

-- ---------------------------------------------------------------------------
-- Reports stay instant. Reviewers can hide one. One report per person per place per 5 minutes.
-- ---------------------------------------------------------------------------

alter table public.reports
  add column hidden boolean not null default false;

comment on column public.reports.hidden is
  'When true, the report is left off the public feed and does not change the live status.';

create index reports_rate_feature_idx on public.reports (user_id, feature_id, created_at desc);
create index reports_rate_node_idx on public.reports (user_id, node_id, created_at desc) where feature_id is null;

create or replace function private.recompute_feature_status(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_at timestamptz;
begin
  if target is null then
    return;
  end if;

  select r.status, r.created_at
  into v_status, v_at
  from public.reports r
  where r.feature_id = target
    and r.hidden = false
  order by r.created_at desc, r.id desc
  limit 1;

  if v_status is null then
    update public.features
    set status = 'unknown',
        last_reported_at = null
    where id = target;
  else
    update public.features
    set status = v_status,
        last_reported_at = v_at
    where id = target;
  end if;
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

  perform private.recompute_feature_status(target);
  return new;
end;
$$;

create or replace function private.guard_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if current_setting('tekpath.hiding_report', true) is distinct from '1'
       and not private.is_moderator_or_admin()
    then
      new.hidden := false;
    end if;

    if (select auth.uid()) is not null and exists (
      select 1
      from public.reports r
      where r.user_id = (select auth.uid())
        and r.created_at > now() - interval '5 minutes'
        and (
          (new.feature_id is not null and r.feature_id = new.feature_id)
          or (
            new.feature_id is null
            and new.node_id is not null
            and r.feature_id is null
            and r.node_id = new.node_id
          )
        )
    ) then
      raise exception 'You already reported this place in the last 5 minutes. Wait a moment and try again.';
    end if;

    return new;
  end if;

  if current_setting('tekpath.hiding_report', true) = '1' or private.is_moderator_or_admin() then
    return new;
  end if;

  new.hidden := old.hidden;
  return new;
end;
$$;

create trigger reports_guard
before insert or update on public.reports
for each row execute function private.guard_report();

drop trigger if exists reports_sync_status on public.reports;
create trigger reports_sync_status
after insert or update of status, hidden on public.reports
for each row execute function private.sync_feature_status();

revoke all on function private.recompute_feature_status(uuid) from public, anon;
revoke all on function private.sync_feature_status() from public, anon;
revoke all on function private.guard_report() from public, anon;
grant execute on function private.recompute_feature_status(uuid) to authenticated, service_role, postgres;
grant execute on function private.sync_feature_status() to authenticated, service_role, postgres;
grant execute on function private.guard_report() to authenticated, service_role, postgres;

create or replace function private.report_is_visible(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.reports r
    where r.id = p_id
      and (
        r.hidden = false
        or private.is_moderator_or_admin()
      )
  );
$$;

revoke all on function private.report_is_visible(uuid) from public;
grant execute on function private.report_is_visible(uuid) to anon, authenticated, service_role;

drop policy reports_select on public.reports;
create policy reports_select on public.reports
  for select to anon, authenticated
  using ((select private.report_is_visible(id)));

create or replace view public.report_feed
with (security_barrier = true, security_invoker = false) as
select
  r.id,
  r.feature_id,
  r.node_id,
  r.status,
  r.note,
  r.photo_url,
  r.created_at,
  p.display_name
from public.reports r
join public.profiles p on p.id = r.user_id
where r.hidden = false;

comment on view public.report_feed is
  'Public report text, photo, and display name. Hidden reports, user ids, and emails are omitted.';

create or replace function public.moderation_reports()
returns table (
  id uuid,
  feature_name text,
  status text,
  note text,
  created_at timestamptz,
  display_name text,
  hidden boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not private.is_moderator_or_admin() then
    raise exception 'Only a moderator can review reports.';
  end if;

  return query
  select
    r.id,
    coalesce(f.name, n.name, 'Place') as feature_name,
    r.status,
    r.note,
    r.created_at,
    p.display_name,
    r.hidden
  from public.reports r
  join public.profiles p on p.id = r.user_id
  left join public.features f on f.id = r.feature_id
  left join public.nodes n on n.id = r.node_id
  order by r.created_at desc
  limit 80;
end;
$$;

create or replace function public.set_report_hidden(report_id uuid, hide boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_feature uuid;
  v_node uuid;
begin
  if not private.is_moderator_or_admin() then
    raise exception 'Only a moderator can hide a report.';
  end if;

  if report_id is null then
    raise exception 'Choose a report.';
  end if;

  perform set_config('tekpath.hiding_report', '1', true);

  update public.reports
  set hidden = coalesce(hide, false)
  where id = report_id
  returning feature_id, node_id into v_feature, v_node;

  if not found then
    raise exception 'That report is no longer here.';
  end if;

  if v_feature is null and v_node is not null then
    select n.feature_id into v_feature from public.nodes n where n.id = v_node;
    if v_feature is null then
      select f.id into v_feature
      from public.features f
      where f.node_id = v_node
      order by f.created_at desc
      limit 1;
    end if;
  end if;

  perform private.recompute_feature_status(v_feature);
end;
$$;

revoke all on function public.moderation_reports() from public;
revoke all on function public.set_report_hidden(uuid, boolean) from public;
grant execute on function public.moderation_reports() to authenticated, service_role;
grant execute on function public.set_report_hidden(uuid, boolean) to authenticated, service_role;
