-- Mobility needs stay with the owner. Display names stay public so reports can
-- show who wrote them. Report notes and photos stay public, without user ids
-- or auth emails.

-- ---------------------------------------------------------------------------
-- Private profile fields
-- ---------------------------------------------------------------------------

create table public.profile_private (
  id uuid primary key references public.profiles (id) on delete cascade,
  mobility_needs text,
  updated_at timestamptz not null default now(),
  constraint profile_private_needs_len check (mobility_needs is null or char_length(mobility_needs) <= 500)
);

insert into public.profile_private (id, mobility_needs)
select id, mobility_needs
from public.profiles;

alter table public.profiles drop column mobility_needs;

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
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), 'Student')
  )
  on conflict (id) do nothing;

  insert into public.profile_private (id)
  values (new.id)
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on table public.profile_private is
  'Owner-only profile fields. mobility_needs is not readable by anon or by other users.';

comment on table public.profiles is
  'Public profile. display_name is shown on reports. Email addresses are not stored here.';

-- ---------------------------------------------------------------------------
-- Reports: notes and photos stay public. Hide the author id from the API.
-- ---------------------------------------------------------------------------

comment on column public.reports.user_id is
  'Account id of the author. Not selectable by anon or authenticated, and it is not an email.';

create view public.report_feed
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
join public.profiles p on p.id = r.user_id;

comment on view public.report_feed is
  'Public report text, photo, and display name. Omits user_id, email, and mobility needs.';

-- The author id is also in the realtime payload if reports are published.
-- Feature updates already broadcast status changes, which is what the app reloads on.
alter publication supabase_realtime drop table public.reports;

-- auth.users holds emails. The Data API roles must not read that table.
revoke all privileges on table auth.users from anon, authenticated;
revoke all privileges on table auth.identities from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Grants.
-- Table-level SELECT cannot be partly revoked, and Supabase default privileges
-- grant ALL when a table is created. Replace those grants with column select
-- so user_id is not readable. anon still has select on profile_private; RLS
-- below returns no rows to anon or to other users.
-- ---------------------------------------------------------------------------

revoke all on table public.reports from anon, authenticated;
grant select (id, feature_id, node_id, status, note, photo_url, created_at)
  on table public.reports to anon, authenticated;
grant insert, update, delete on table public.reports to authenticated;
grant select, insert, update, delete on table public.reports to service_role;

revoke all on table public.report_feed from public, anon, authenticated;
grant select on table public.report_feed to anon, authenticated, service_role;

revoke all on table public.profile_private from public, anon, authenticated;
grant select on table public.profile_private to anon;
grant select, insert, update, delete on table public.profile_private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS. Only the signed-in owner can read or write mobility needs.
-- ---------------------------------------------------------------------------

alter table public.profile_private enable row level security;

create policy profile_private_select on public.profile_private
  for select to authenticated
  using (id = (select auth.uid()));

create policy profile_private_insert on public.profile_private
  for insert to authenticated
  with check (id = (select auth.uid()));

create policy profile_private_update on public.profile_private
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy profile_private_delete on public.profile_private
  for delete to authenticated
  using (id = (select auth.uid()));
