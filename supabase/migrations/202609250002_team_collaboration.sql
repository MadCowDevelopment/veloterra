alter table public.profiles
  add column if not exists username text,
  add column if not exists username_normalized text,
  add column if not exists username_claimed_at timestamptz;

create table if not exists public.username_claims (
  username_normalized text primary key,
  username text not null,
  user_id uuid not null unique references auth.users on delete restrict,
  claimed_at timestamptz not null default now()
);

create unique index if not exists profiles_username_normalized_idx
  on public.profiles (username_normalized)
  where username_normalized is not null;

alter table public.profiles drop constraint if exists profiles_username_shape;
alter table public.profiles add constraint profiles_username_shape check (
  username is null or username ~ '^[A-Za-z0-9](?:[A-Za-z0-9_-]{1,22}[A-Za-z0-9])?$'
);
alter table public.profiles drop constraint if exists profiles_username_normalized_shape;
alter table public.profiles add constraint profiles_username_normalized_shape check (
  username_normalized is null or username_normalized = lower(username_normalized)
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 1000),
  logo_url text not null default '' check (char_length(logo_url) <= 500000),
  captain_id uuid not null references auth.users on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_memberships (
  team_id uuid not null references public.teams on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('captain', 'officer', 'member')),
  status text not null default 'active' check (status in ('active', 'removed')),
  share_historical boolean not null default true,
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (team_id, user_id)
);

create unique index if not exists team_one_active_captain_idx
  on public.team_memberships (team_id)
  where status = 'active' and role = 'captain';

create table if not exists public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams on delete cascade,
  invitee_user_id uuid not null references auth.users on delete cascade,
  invitee_username text not null check (char_length(invitee_username) between 3 and 24),
  inviter_user_id uuid not null references auth.users on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'expired', 'revoked')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create unique index if not exists team_pending_invitation_idx
  on public.team_invitations (team_id, invitee_user_id)
  where status = 'pending';

create table if not exists public.team_recommendations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams on delete cascade,
  recommender_user_id uuid not null references auth.users on delete restrict,
  prospective_user_id uuid not null references auth.users on delete cascade,
  prospective_username text not null check (char_length(prospective_username) between 3 and 24),
  note text not null default '' check (char_length(note) <= 500),
  status text not null default 'pending'
    check (status in ('pending', 'invited', 'declined', 'dismissed')),
  reviewer_user_id uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create unique index if not exists team_pending_recommendation_idx
  on public.team_recommendations (team_id, prospective_user_id)
  where status = 'pending';

create table if not exists public.team_explored_cells (
  team_id uuid not null references public.teams on delete cascade,
  h3 text not null check (char_length(h3) between 15 and 32),
  user_id uuid not null references auth.users on delete cascade,
  first_contributed_at timestamptz not null default now(),
  primary key (team_id, h3, user_id)
);

create index if not exists team_explored_cells_team_h3_idx
  on public.team_explored_cells (team_id, h3);

create table if not exists public.team_live_presence (
  team_id uuid not null references public.teams on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (team_id, user_id)
);

create table if not exists public.team_audit_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams on delete cascade,
  actor_user_id uuid not null references auth.users on delete restrict,
  event_type text not null,
  affected_user_id uuid references auth.users on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists team_audit_events_team_created_idx
  on public.team_audit_events (team_id, created_at desc);

create or replace function public.team_role_for(p_team_id uuid, p_user_id uuid default auth.uid())
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.team_memberships
  where team_id = p_team_id
    and user_id = coalesce(p_user_id, auth.uid())
    and status = 'active'
  limit 1;
$$;

create or replace function public.is_active_team_member(
  p_team_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.team_role_for(p_team_id, coalesce(p_user_id, auth.uid())) is not null;
$$;

create or replace function public.save_my_profile(p_display_name text, p_avatar_url text default null)
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
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_display_name is null or char_length(trim(p_display_name)) not between 1 and 80 then
    raise exception 'Display name must be between 1 and 80 characters' using errcode = '22023';
  end if;
  if p_avatar_url is not null and char_length(p_avatar_url) > 2000 then
    raise exception 'Avatar URL is too long' using errcode = '22023';
  end if;

  insert into public.profiles (user_id, display_name, avatar_url, updated_at)
  values (auth.uid(), trim(p_display_name), nullif(trim(p_avatar_url), ''), now())
  on conflict (user_id) do update set
    display_name = excluded.display_name,
    avatar_url = excluded.avatar_url,
    updated_at = now();

  return query
    select p.user_id, p.username, p.username_normalized, p.username_claimed_at,
      p.display_name, p.avatar_url
    from public.profiles p
    where p.user_id = auth.uid();
end;
$$;

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
  if existing_claim.user_id <> auth.uid() then
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

create or replace function public.lookup_username(p_username text)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id, p.username, p.display_name, p.avatar_url
  from public.profiles p
  where auth.uid() is not null
    and p.username_normalized = lower(trim(p_username))
  limit 1;
$$;

create or replace function public.create_team(
  p_name text,
  p_description text default '',
  p_logo_url text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_team public.teams;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles where user_id = auth.uid() and username_normalized is not null
  ) then
    raise exception 'Claim a username before creating a team' using errcode = '42501';
  end if;
  if p_name is null or char_length(trim(p_name)) not between 1 and 80 then
    raise exception 'Team name must be between 1 and 80 characters' using errcode = '22023';
  end if;
  if p_description is null or char_length(p_description) > 1000 then
    raise exception 'Team description is too long' using errcode = '22023';
  end if;
  if p_logo_url is null or char_length(p_logo_url) > 500000 then
    raise exception 'Team logo is too large' using errcode = '22023';
  end if;

  insert into public.teams (name, description, logo_url, captain_id)
  values (trim(p_name), coalesce(p_description, ''), coalesce(p_logo_url, ''), auth.uid())
  returning * into created_team;
  insert into public.team_memberships (team_id, user_id, role, status)
  values (created_team.id, auth.uid(), 'captain', 'active');
  insert into public.team_audit_events (team_id, actor_user_id, event_type)
  values (created_team.id, auth.uid(), 'team_created');

  return jsonb_build_object(
    'id', created_team.id,
    'name', created_team.name,
    'description', created_team.description,
    'logo_url', created_team.logo_url,
    'captain_id', created_team.captain_id,
    'role', 'captain',
    'joined_at', now()
  );
end;
$$;

create or replace function public.get_my_teams()
returns table (
  team_id uuid,
  name text,
  description text,
  logo_url text,
  captain_id uuid,
  role text,
  joined_at timestamptz,
  member_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.name, t.description, t.logo_url, t.captain_id,
    m.role, m.joined_at,
    (select count(*) from public.team_memberships active_members
      where active_members.team_id = t.id and active_members.status = 'active')
  from public.teams t
  join public.team_memberships m on m.team_id = t.id
    and m.user_id = auth.uid() and m.status = 'active'
  where auth.uid() is not null
  order by t.created_at;
$$;

create or replace function public.get_team_members(p_team_id uuid)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  role text,
  joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_active_team_member(p_team_id) then
    raise exception 'Team membership required' using errcode = '42501';
  end if;
  return query
    select m.user_id, p.username, coalesce(p.display_name, 'VeloTerra rider'),
      p.avatar_url, m.role, m.joined_at
    from public.team_memberships m
    left join public.profiles p on p.user_id = m.user_id
    where m.team_id = p_team_id and m.status = 'active'
    order by case m.role when 'captain' then 0 when 'officer' then 1 else 2 end,
      lower(coalesce(p.display_name, p.username, 'VeloTerra rider'));
end;
$$;

create or replace function public.get_my_invitations()
returns table (
  invitation_id uuid,
  team_id uuid,
  team_name text,
  team_description text,
  team_logo_url text,
  inviter_username text,
  inviter_display_name text,
  expires_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.team_id, t.name, t.description, t.logo_url,
    inviter.username, coalesce(inviter.display_name, 'VeloTerra rider'),
    i.expires_at, i.created_at
  from public.team_invitations i
  join public.teams t on t.id = i.team_id
  left join public.profiles inviter on inviter.user_id = i.inviter_user_id
  where i.invitee_user_id = auth.uid()
    and i.status = 'pending'
    and i.expires_at > now()
  order by i.created_at desc;
$$;

create or replace function public.invite_team_member(p_team_id uuid, p_username text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.profiles;
  current_invitation public.team_invitations;
  invitation_id uuid;
begin
  if public.team_role_for(p_team_id) not in ('captain', 'officer') then
    raise exception 'Invite permission required' using errcode = '42501';
  end if;
  select * into target from public.profiles
  where username_normalized = lower(trim(p_username));
  if target.user_id is null then
    raise exception 'No VeloTerra user has that username' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.team_memberships
    where team_id = p_team_id and user_id = target.user_id and status = 'active'
  ) then
    raise exception 'That user is already a team member' using errcode = '23514';
  end if;
  select * into current_invitation from public.team_invitations
  where team_id = p_team_id and invitee_user_id = target.user_id and status = 'pending'
  for update;
  if current_invitation.id is not null then
    if current_invitation.expires_at > now() then
      raise exception 'That user already has a pending invitation' using errcode = '23514';
    end if;
    update public.team_invitations set status = 'expired', responded_at = now()
    where id = current_invitation.id;
  end if;

  insert into public.team_invitations (
    team_id, invitee_user_id, invitee_username, inviter_user_id, expires_at
  ) values (
    p_team_id, target.user_id, target.username, auth.uid(), now() + interval '7 days'
  ) returning id into invitation_id;
  insert into public.team_audit_events (
    team_id, actor_user_id, event_type, affected_user_id, metadata
  ) values (
    p_team_id, auth.uid(), 'member_invited', target.user_id,
    jsonb_build_object('username', target.username)
  );
  return invitation_id;
end;
$$;

create or replace function public.respond_to_team_invitation(
  p_invitation_id uuid,
  p_accept boolean,
  p_share_historical boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.team_invitations;
begin
  select * into invitation
  from public.team_invitations
  where id = p_invitation_id and invitee_user_id = auth.uid() and status = 'pending'
  for update;
  if invitation.id is null then
    raise exception 'Invitation is no longer available' using errcode = 'P0002';
  end if;
  if invitation.expires_at <= now() then
    update public.team_invitations set status = 'expired', responded_at = now()
    where id = invitation.id;
    raise exception 'Invitation has expired' using errcode = 'P0001';
  end if;

  if not p_accept then
    update public.team_invitations set status = 'declined', responded_at = now()
    where id = invitation.id;
    insert into public.team_audit_events (team_id, actor_user_id, event_type, affected_user_id)
    values (invitation.team_id, auth.uid(), 'invitation_declined', auth.uid());
    return invitation.team_id;
  end if;

  if not p_share_historical then
    raise exception 'Sharing consent is required to join a team' using errcode = '42501';
  end if;
  insert into public.team_memberships (
    team_id, user_id, role, status, share_historical, joined_at, removed_at
  ) values (
    invitation.team_id, auth.uid(), 'member', 'active', p_share_historical, now(), null
  )
  on conflict (team_id, user_id) do update set
    role = 'member', status = 'active', share_historical = excluded.share_historical,
    joined_at = now(), removed_at = null;
  update public.team_invitations set status = 'accepted', responded_at = now()
  where id = invitation.id;
  insert into public.team_audit_events (team_id, actor_user_id, event_type, affected_user_id)
  values (invitation.team_id, auth.uid(), 'member_joined', auth.uid());
  return invitation.team_id;
end;
$$;

create or replace function public.recommend_team_member(
  p_team_id uuid,
  p_username text,
  p_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.profiles;
  recommendation_id uuid;
begin
  if public.team_role_for(p_team_id) is null then
    raise exception 'Team membership required' using errcode = '42501';
  end if;
  if p_note is null or char_length(p_note) > 500 then
    raise exception 'Recommendation note is too long' using errcode = '22023';
  end if;
  select * into target from public.profiles
  where username_normalized = lower(trim(p_username));
  if target.user_id is null then
    raise exception 'No VeloTerra user has that username' using errcode = 'P0002';
  end if;
  if target.user_id = auth.uid() then
    raise exception 'You cannot recommend yourself' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.team_memberships
    where team_id = p_team_id and user_id = target.user_id and status = 'active'
  ) then
    raise exception 'That user is already a team member' using errcode = '23514';
  end if;
  insert into public.team_recommendations (
    team_id, recommender_user_id, prospective_user_id, prospective_username, note
  ) values (
    p_team_id, auth.uid(), target.user_id, target.username, coalesce(p_note, '')
  ) returning id into recommendation_id;
  return recommendation_id;
exception
  when unique_violation then
    raise exception 'A pending recommendation already exists for that user' using errcode = '23514';
end;
$$;

create or replace function public.review_team_recommendation(
  p_recommendation_id uuid,
  p_action text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  recommendation public.team_recommendations;
  existing_invitation public.team_invitations;
  created_invitation uuid;
begin
  select * into recommendation from public.team_recommendations
  where id = p_recommendation_id and status = 'pending' for update;
  if recommendation.id is null then
    raise exception 'Recommendation is no longer pending' using errcode = 'P0002';
  end if;
  if public.team_role_for(recommendation.team_id) not in ('captain', 'officer') then
    raise exception 'Invite permission required' using errcode = '42501';
  end if;
  if p_action not in ('invite', 'decline', 'dismiss') then
    raise exception 'Invalid recommendation action' using errcode = '22023';
  end if;

  if p_action = 'invite' then
    select * into existing_invitation from public.team_invitations
    where team_id = recommendation.team_id
      and invitee_user_id = recommendation.prospective_user_id
      and status = 'pending';
    if existing_invitation.id is not null and existing_invitation.expires_at > now() then
      raise exception 'That user already has a pending invitation' using errcode = '23514';
    end if;
    if existing_invitation.id is not null then
      update public.team_invitations set status = 'expired', responded_at = now()
      where id = existing_invitation.id;
    end if;
    insert into public.team_invitations (
      team_id, invitee_user_id, invitee_username, inviter_user_id, expires_at
    ) values (
      recommendation.team_id, recommendation.prospective_user_id,
      recommendation.prospective_username, auth.uid(), now() + interval '7 days'
    ) returning id into created_invitation;
    update public.team_recommendations set status = 'invited', reviewer_user_id = auth.uid(), reviewed_at = now()
    where id = recommendation.id;
    insert into public.team_audit_events (
      team_id, actor_user_id, event_type, affected_user_id, metadata
    ) values (
      recommendation.team_id, auth.uid(), 'recommendation_invited', recommendation.prospective_user_id,
      jsonb_build_object('recommendation_id', recommendation.id)
    );
    return created_invitation;
  end if;

  update public.team_recommendations
  set status = case when p_action = 'decline' then 'declined' else 'dismissed' end,
    reviewer_user_id = auth.uid(), reviewed_at = now()
  where id = recommendation.id;
  return recommendation.team_id;
end;
$$;

create or replace function public.update_team_details(
  p_team_id uuid,
  p_name text,
  p_description text,
  p_logo_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.team_role_for(p_team_id) <> 'captain' then
    raise exception 'Captain permission required' using errcode = '42501';
  end if;
  if p_name is null or char_length(trim(p_name)) not between 1 and 80 then
    raise exception 'Team name must be between 1 and 80 characters' using errcode = '22023';
  end if;
  if p_description is null or char_length(p_description) > 1000 then
    raise exception 'Team description is too long' using errcode = '22023';
  end if;
  if p_logo_url is null or char_length(p_logo_url) > 500000 then
    raise exception 'Team logo is too large' using errcode = '22023';
  end if;
  update public.teams set name = trim(p_name), description = p_description, logo_url = p_logo_url, updated_at = now()
  where id = p_team_id;
  insert into public.team_audit_events (team_id, actor_user_id, event_type)
  values (p_team_id, auth.uid(), 'team_updated');
end;
$$;

create or replace function public.change_team_member_role(
  p_team_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.team_role_for(p_team_id) <> 'captain' then
    raise exception 'Captain permission required' using errcode = '42501';
  end if;
  if p_role not in ('officer', 'member') then
    raise exception 'Use captain transfer to change the Captain role' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.team_memberships
    where team_id = p_team_id and user_id = p_user_id and status = 'active'
  ) then
    raise exception 'Active member not found' using errcode = 'P0002';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Transfer Captain before changing your own role' using errcode = '22023';
  end if;
  update public.team_memberships set role = p_role where team_id = p_team_id and user_id = p_user_id;
  insert into public.team_audit_events (team_id, actor_user_id, event_type, affected_user_id, metadata)
  values (p_team_id, auth.uid(), 'member_role_changed', p_user_id, jsonb_build_object('role', p_role));
end;
$$;

create or replace function public.transfer_team_captain(p_team_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.team_role_for(p_team_id) <> 'captain' then
    raise exception 'Captain permission required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.team_memberships
    where team_id = p_team_id and user_id = p_user_id and status = 'active' and p_user_id <> auth.uid()
  ) then
    raise exception 'Transfer target must be another active member' using errcode = 'P0002';
  end if;
  update public.team_memberships set role = 'member'
  where team_id = p_team_id and user_id = auth.uid() and status = 'active';
  update public.team_memberships set role = 'captain'
  where team_id = p_team_id and user_id = p_user_id and status = 'active';
  update public.teams set captain_id = p_user_id, updated_at = now() where id = p_team_id;
  insert into public.team_audit_events (team_id, actor_user_id, event_type, affected_user_id)
  values (p_team_id, auth.uid(), 'captain_transferred', p_user_id);
end;
$$;

create or replace function public.remove_team_member(p_team_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.team_role_for(p_team_id) <> 'captain' then
    raise exception 'Captain permission required' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Transfer Captain before leaving the team' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.team_memberships
    where team_id = p_team_id and user_id = p_user_id and status = 'active'
  ) then
    raise exception 'Active member not found' using errcode = 'P0002';
  end if;
  update public.team_memberships set status = 'removed', removed_at = now()
  where team_id = p_team_id and user_id = p_user_id;
  update public.team_invitations set status = 'revoked', responded_at = now()
  where team_id = p_team_id and invitee_user_id = p_user_id and status = 'pending';
  delete from public.team_live_presence where team_id = p_team_id and user_id = p_user_id;
  insert into public.team_audit_events (team_id, actor_user_id, event_type, affected_user_id)
  values (p_team_id, auth.uid(), 'member_removed', p_user_id);
end;
$$;

create or replace function public.leave_team(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.team_role_for(p_team_id) is null then
    raise exception 'Team membership required' using errcode = '42501';
  end if;
  if public.team_role_for(p_team_id) = 'captain' then
    raise exception 'Transfer Captain before leaving the team' using errcode = '22023';
  end if;
  update public.team_memberships set status = 'removed', removed_at = now()
  where team_id = p_team_id and user_id = auth.uid() and status = 'active';
  update public.team_invitations set status = 'revoked', responded_at = now()
  where team_id = p_team_id and invitee_user_id = auth.uid() and status = 'pending';
  delete from public.team_live_presence where team_id = p_team_id and user_id = auth.uid();
  insert into public.team_audit_events (team_id, actor_user_id, event_type, affected_user_id)
  values (p_team_id, auth.uid(), 'member_left', auth.uid());
end;
$$;

create or replace function public.revoke_team_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.team_invitations;
begin
  select * into invitation from public.team_invitations where id = p_invitation_id for update;
  if invitation.id is null or public.team_role_for(invitation.team_id) not in ('captain', 'officer') then
    raise exception 'Invite permission required' using errcode = '42501';
  end if;
  update public.team_invitations set status = 'revoked', responded_at = now()
  where id = invitation.id and status = 'pending';
end;
$$;

create or replace function public.delete_team(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.team_role_for(p_team_id) <> 'captain' then
    raise exception 'Captain permission required' using errcode = '42501';
  end if;
  delete from public.teams where id = p_team_id;
end;
$$;

alter table public.teams enable row level security;
alter table public.team_memberships enable row level security;
alter table public.team_invitations enable row level security;
alter table public.team_recommendations enable row level security;
alter table public.team_explored_cells enable row level security;
alter table public.team_live_presence enable row level security;
alter table public.team_audit_events enable row level security;
alter table public.username_claims enable row level security;

drop policy if exists "authenticated profiles are visible" on public.profiles;
drop policy if exists "users manage their profile" on public.profiles;
drop policy if exists "users update their profile" on public.profiles;
create policy "users read their profile"
  on public.profiles for select to authenticated using (auth.uid() = user_id);

create policy "active members read teams"
  on public.teams for select to authenticated using (public.is_active_team_member(id));
create policy "active members read memberships"
  on public.team_memberships for select to authenticated using (public.is_active_team_member(team_id));
create policy "invitees and managers read invitations"
  on public.team_invitations for select to authenticated using (
    auth.uid() = invitee_user_id or public.team_role_for(team_id) in ('captain', 'officer')
  );
create policy "members and managers read recommendations"
  on public.team_recommendations for select to authenticated using (
    auth.uid() = recommender_user_id or public.team_role_for(team_id) in ('captain', 'officer')
  );
create policy "active members read and contribute cells"
  on public.team_explored_cells for select to authenticated using (public.is_active_team_member(team_id));
create policy "active members add own cells"
  on public.team_explored_cells for insert to authenticated
  with check (auth.uid() = user_id and public.is_active_team_member(team_id));
create policy "active members read live presence"
  on public.team_live_presence for select to authenticated using (
    public.is_active_team_member(team_id) and expires_at > now()
  );
create policy "members write own live presence"
  on public.team_live_presence for insert to authenticated
  with check (auth.uid() = user_id and public.is_active_team_member(team_id));
create policy "members update own live presence"
  on public.team_live_presence for update to authenticated
  using (auth.uid() = user_id and public.is_active_team_member(team_id))
  with check (auth.uid() = user_id and public.is_active_team_member(team_id));
create policy "members delete own live presence"
  on public.team_live_presence for delete to authenticated using (auth.uid() = user_id);
create policy "managers read audit history"
  on public.team_audit_events for select to authenticated using (
    public.team_role_for(team_id) in ('captain', 'officer')
  );

revoke all on public.username_claims from anon, authenticated;
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant select on public.teams, public.team_memberships, public.team_invitations,
  public.team_recommendations, public.team_explored_cells, public.team_live_presence,
  public.team_audit_events to authenticated;
grant insert on public.team_explored_cells to authenticated;
grant insert, update, delete on public.team_live_presence to authenticated;

revoke execute on function public.team_role_for(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.is_active_team_member(uuid, uuid) from public, anon, authenticated;
grant execute on function public.save_my_profile(text, text) to authenticated;
grant execute on function public.claim_username(text) to authenticated;
grant execute on function public.lookup_username(text) to authenticated;
grant execute on function public.create_team(text, text, text) to authenticated;
grant execute on function public.get_my_teams() to authenticated;
grant execute on function public.get_team_members(uuid) to authenticated;
grant execute on function public.get_my_invitations() to authenticated;
grant execute on function public.invite_team_member(uuid, text) to authenticated;
grant execute on function public.respond_to_team_invitation(uuid, boolean, boolean) to authenticated;
grant execute on function public.recommend_team_member(uuid, text, text) to authenticated;
grant execute on function public.review_team_recommendation(uuid, text) to authenticated;
grant execute on function public.update_team_details(uuid, text, text, text) to authenticated;
grant execute on function public.change_team_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.transfer_team_captain(uuid, uuid) to authenticated;
grant execute on function public.remove_team_member(uuid, uuid) to authenticated;
grant execute on function public.leave_team(uuid) to authenticated;
grant execute on function public.revoke_team_invitation(uuid) to authenticated;
grant execute on function public.delete_team(uuid) to authenticated;