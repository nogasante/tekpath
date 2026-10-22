-- Guest sign-in uses supabase.auth.signInAnonymously().
-- Those users are role `authenticated` with JWT claim is_anonymous = true.
-- Reports, profiles, profile_private, map points, and report photos already
-- allow every authenticated user who matches auth.uid(). Do not add a
-- restrictive policy on is_anonymous; guests must insert the same rows as
-- email users. This migration only labels a guest profile when they have
-- not chosen a display name.

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

  return new;
end;
$$;

comment on policy reports_insert on public.reports is
  'Any authenticated user, including an anonymous guest, may insert a report stamped with their own auth.uid().';

comment on policy profiles_insert on public.profiles is
  'Any authenticated user, including an anonymous guest, may insert only the profile row for auth.uid(). The new-user trigger does this.';

comment on policy profiles_update on public.profiles is
  'Any authenticated user, including an anonymous guest, may update only their own display name.';

comment on policy profile_private_insert on public.profile_private is
  'Any authenticated user, including an anonymous guest, may insert only their own private profile row.';
