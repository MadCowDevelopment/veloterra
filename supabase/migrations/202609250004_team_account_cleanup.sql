-- Account cleanup: remove team-owned data when appropriate while retaining
-- claimed usernames so identity handles are never recycled.

alter table public.teams
  drop constraint if exists teams_logo_url_check;
alter table public.teams
  add constraint teams_logo_url_check check (char_length(logo_url) <= 350000);
alter table public.teams
  add constraint teams_logo_url_format_check check (
    logo_url = '' or logo_url ~* '^data:image/(png|jpeg|gif|webp|svg[+]xml)(;[a-z0-9=+_-]+)*,'
  );

alter table public.username_claims
  alter column user_id drop not null;
alter table public.username_claims
  drop constraint if exists username_claims_user_id_fkey;
alter table public.username_claims
  add constraint username_claims_user_id_fkey
  foreign key (user_id) references auth.users on delete set null;

alter table public.teams
  drop constraint if exists teams_captain_id_fkey;
alter table public.teams
  add constraint teams_captain_id_fkey
  foreign key (captain_id) references auth.users on delete restrict;

alter table public.team_invitations
  drop constraint if exists team_invitations_inviter_user_id_fkey;
alter table public.team_invitations
  add constraint team_invitations_inviter_user_id_fkey
  foreign key (inviter_user_id) references auth.users on delete cascade;

alter table public.team_recommendations
  drop constraint if exists team_recommendations_recommender_user_id_fkey;
alter table public.team_recommendations
  add constraint team_recommendations_recommender_user_id_fkey
  foreign key (recommender_user_id) references auth.users on delete cascade;

alter table public.team_audit_events
  alter column actor_user_id drop not null;
alter table public.team_audit_events
  drop constraint if exists team_audit_events_actor_user_id_fkey;
alter table public.team_audit_events
  add constraint team_audit_events_actor_user_id_fkey
  foreign key (actor_user_id) references auth.users on delete set null;

create or replace function public.claim_username(p_username text)
returns table (
  user_id uuid,
  username text,
  username_normalized text,
  username_claimed_at timestamptz,
  display_name text,
  avatar_url text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized text := lower(trim(p_username));
  current_profile public.profiles;
  existing_claim public.username_claims;
  suggested_name text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if normalized !~ '^[a-z0-9](?:[a-z0-9_-]{1,22}[a-z0-9])?$' then
    raise exception 'Username must be 3-24 characters using letters, numbers, underscore, or hyphen' using errcode = '22023';
  end if;
  if normalized in ('admin', 'administrator', 'support', 'system', 'veloterra', 'moderator', 'captain', 'officer', 'member') then
    raise exception 'That username is reserved' using errcode = '23514';
  end if;

  select * into current_profile from public.profiles where user_id = auth.uid() for update;
  if current_profile.username_normalized is not null then
    if current_profile.username_normalized <> normalized then
      raise exception 'Username cannot be changed after it is claimed' using errcode = '23514';
    end if;
    return query select current_profile.user_id, current_profile.username,
      current_profile.username_normalized, current_profile.username_claimed_at,
      current_profile.display_name, current_profile.avatar_url;
    return;
  end if;

  insert into public.username_claims (username_normalized, username, user_id)
  values (normalized, trim(p_username), auth.uid())
  on conflict (username_normalized) do nothing;

  select * into existing_claim
  from public.username_claims
  where username_normalized = normalized;
  if existing_claim.user_id is distinct from auth.uid() then
    raise exception 'That username is already taken' using errcode = '23505';
  end if;

  suggested_name := coalesce(
    current_profile.display_name,
    (select raw_user_meta_data ->> 'full_name' from auth.users where id = auth.uid()),
    (select raw_user_meta_data ->> 'name' from auth.users where id = auth.uid()),
    'VeloTerra rider'
  );
  insert into public.profiles (
    user_id, display_name, avatar_url, username, username_normalized, username_claimed_at, updated_at
  ) values (
    auth.uid(), left(trim(suggested_name), 80), current_profile.avatar_url,
    trim(p_username), normalized, now(), now()
  )
  on conflict (user_id) do update set
    username = excluded.username,
    username_normalized = excluded.username_normalized,
    username_claimed_at = excluded.username_claimed_at,
    updated_at = now();

  return query
    select p.user_id, p.username, p.username_normalized, p.username_claimed_at,
      p.display_name, p.avatar_url
    from public.profiles p
    where p.user_id = auth.uid();
end;
$$;

revoke execute on function public.claim_username(text) from public, anon;
grant execute on function public.claim_username(text) to authenticated;

create or replace function public.audit_team_recommendation_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_name text;
begin
  if tg_op = 'INSERT' then
    event_name := 'recommendation_submitted';
  elsif new.status = 'declined' then
    event_name := 'recommendation_declined';
  elsif new.status = 'dismissed' then
    event_name := 'recommendation_dismissed';
  else
    return new;
  end if;
  insert into public.team_audit_events (
    team_id, actor_user_id, event_type, affected_user_id, metadata
  ) values (
    new.team_id, auth.uid(), event_name, new.prospective_user_id,
    jsonb_build_object('recommendation_id', new.id)
  );
  return new;
end;
$$;

drop trigger if exists team_recommendation_audit_trigger on public.team_recommendations;
create trigger team_recommendation_audit_trigger
after insert or update of status on public.team_recommendations
for each row execute function public.audit_team_recommendation_change();

create or replace function public.audit_team_invitation_revocation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'pending' and new.status = 'revoked' then
    insert into public.team_audit_events (
      team_id, actor_user_id, event_type, affected_user_id
    ) values (
      new.team_id, auth.uid(), 'invitation_revoked', new.invitee_user_id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists team_invitation_revocation_audit_trigger on public.team_invitations;
create trigger team_invitation_revocation_audit_trigger
after update of status on public.team_invitations
for each row execute function public.audit_team_invitation_revocation();

revoke execute on function public.audit_team_recommendation_change() from public, anon, authenticated;
revoke execute on function public.audit_team_invitation_revocation() from public, anon, authenticated;

create or replace function public.assert_team_has_captain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  team_record public.teams;
  team_id_value uuid;
begin
  if tg_table_name = 'teams' then
    team_id_value := case when tg_op = 'DELETE' then old.id else new.id end;
  else
    team_id_value := case when tg_op = 'DELETE' then old.team_id else new.team_id end;
  end if;
  select * into team_record from public.teams where id = team_id_value;
  if team_record.id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;
  if not exists (
    select 1
    from public.team_memberships membership
    where membership.team_id = team_record.id
      and membership.user_id = team_record.captain_id
      and membership.role = 'captain'
      and membership.status = 'active'
  ) then
    raise exception 'A team must have exactly one active Captain' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists team_captain_invariant_trigger on public.teams;
create constraint trigger team_captain_invariant_trigger
after insert or update of captain_id on public.teams
deferrable initially deferred
for each row execute function public.assert_team_has_captain();

drop trigger if exists team_membership_captain_invariant_trigger on public.team_memberships;
create constraint trigger team_membership_captain_invariant_trigger
after insert or update of team_id, user_id, role, status or delete on public.team_memberships
deferrable initially deferred
for each row execute function public.assert_team_has_captain();

revoke execute on function public.assert_team_has_captain() from public, anon, authenticated;