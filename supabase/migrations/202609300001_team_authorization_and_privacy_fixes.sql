-- team_role_for() returns NULL for non-members, and PL/pgSQL skips IF branches
-- whose condition is NULL. Every role check therefore coalesces the role first.

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
  if coalesce(public.team_role_for(p_team_id), '') not in ('captain', 'officer') then
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
  if coalesce(public.team_role_for(recommendation.team_id), '') not in ('captain', 'officer') then
    raise exception 'Invite permission required' using errcode = '42501';
  end if;
  if coalesce(p_action, '') not in ('invite', 'decline', 'dismiss') then
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
  if coalesce(public.team_role_for(p_team_id), '') <> 'captain' then
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
  if coalesce(public.team_role_for(p_team_id), '') <> 'captain' then
    raise exception 'Captain permission required' using errcode = '42501';
  end if;
  if coalesce(p_role, '') not in ('officer', 'member') then
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
  if coalesce(public.team_role_for(p_team_id), '') <> 'captain' then
    raise exception 'Captain permission required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.team_memberships
    where team_id = p_team_id
      and user_id = p_user_id
      and status = 'active'
      and role = 'officer'
      and p_user_id <> auth.uid()
  ) then
    raise exception 'Transfer target must be another active officer' using errcode = 'P0002';
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
  if coalesce(public.team_role_for(p_team_id), '') <> 'captain' then
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
  if invitation.id is null
    or coalesce(public.team_role_for(invitation.team_id), '') not in ('captain', 'officer') then
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
  if coalesce(public.team_role_for(p_team_id), '') <> 'captain' then
    raise exception 'Captain permission required' using errcode = '42501';
  end if;
  delete from public.teams where id = p_team_id;
end;
$$;

-- Per-contributor rows reveal each member's riding footprint; members read
-- anonymized cells through get_team_cells() and write through add_team_cells().
drop policy if exists "active members read active contributors cells" on public.team_explored_cells;
drop policy if exists "active members add own cells" on public.team_explored_cells;
revoke select, insert, update, delete on public.team_explored_cells from anon, authenticated;

-- Earlier clients defaulted the public display name to the account email.
update public.profiles as p
set display_name = coalesce(
    nullif(left(trim(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')), 80), ''),
    'VeloTerra rider'
  ),
  updated_at = now()
from auth.users as u
where u.id = p.user_id
  and u.email is not null
  and lower(trim(p.display_name)) = lower(trim(u.email));
