-- Team security hardening: enforce membership limits and keep live presence
-- and shared-cell writes under server control.

create or replace function public.team_role_for(p_team_id uuid, p_user_id uuid default auth.uid())
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.team_memberships
  where (p_user_id is null or p_user_id = auth.uid())
    and team_id = p_team_id
    and user_id = coalesce(p_user_id, auth.uid())
    and status = 'active'
  limit 1;
$$;

do $$
declare
  constraint_name text;
begin
  select constraint_record.conname into constraint_name
  from pg_constraint constraint_record
  where constraint_record.conrelid = 'public.team_explored_cells'::regclass
    and constraint_record.contype = 'c'
    and pg_get_constraintdef(constraint_record.oid) like '%char_length(h3)%'
  limit 1;
  if constraint_name is not null then
    execute format('alter table public.team_explored_cells drop constraint %I', constraint_name);
  end if;
end;
$$;
alter table public.team_explored_cells
  add constraint team_explored_cells_h3_shape
  check (h3 ~ '^[0-9a-fA-F]{15}$');

create or replace function public.enforce_team_member_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_count integer;
begin
  if new.status <> 'active' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'active' and old.team_id = new.team_id then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.team_id::text, 0));
  select count(*) into active_count
  from public.team_memberships
  where team_id = new.team_id
    and status = 'active'
    and user_id <> new.user_id;
  if active_count >= 50 then
    raise exception 'This team already has the maximum of 50 active members' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists team_member_limit_trigger on public.team_memberships;
create trigger team_member_limit_trigger
before insert or update of team_id, status on public.team_memberships
for each row execute function public.enforce_team_member_limit();

create or replace function public.remove_team_contributions_on_membership_end()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'active' and new.status = 'removed' then
    delete from public.team_explored_cells
    where team_id = new.team_id and user_id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists team_membership_contribution_cleanup on public.team_memberships;
create trigger team_membership_contribution_cleanup
after update of status on public.team_memberships
for each row execute function public.remove_team_contributions_on_membership_end();

delete from public.team_explored_cells cells
where not exists (
  select 1
  from public.team_memberships membership
  where membership.team_id = cells.team_id
    and membership.user_id = cells.user_id
    and membership.status = 'active'
);

drop policy if exists "active members read and contribute cells" on public.team_explored_cells;
create policy "active members read active contributors cells"
  on public.team_explored_cells for select to authenticated using (
    public.is_active_team_member(team_id)
    and exists (
      select 1
      from public.team_memberships contributor
      where contributor.team_id = team_explored_cells.team_id
        and contributor.user_id = team_explored_cells.user_id
        and contributor.status = 'active'
    )
  );
drop policy if exists "active members add own cells" on public.team_explored_cells;
create policy "active members add own cells"
  on public.team_explored_cells for insert to authenticated
  with check (auth.uid() = user_id and public.is_active_team_member(team_id));

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

  if not exists (
    select 1
    from public.profiles
    where user_id = auth.uid()
      and username_normalized = lower(trim(invitation.invitee_username))
  ) then
    raise exception 'Claim the invited username before joining this team' using errcode = '42501';
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
  if p_avatar_url is not null and char_length(p_avatar_url) > 350000 then
    raise exception 'Avatar image is too large' using errcode = '22023';
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

create or replace function public.set_team_live_presence(
  p_team_id uuid,
  p_latitude double precision,
  p_longitude double precision
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_update timestamptz;
begin
  if auth.uid() is null or not public.is_active_team_member(p_team_id) then
    raise exception 'Active team membership required' using errcode = '42501';
  end if;
  if p_latitude is null or p_latitude < -90 or p_latitude > 90
    or p_longitude is null or p_longitude < -180 or p_longitude > 180 then
    raise exception 'Invalid position' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended((p_team_id::text || ':' || auth.uid()::text), 0));
  select updated_at into previous_update
  from public.team_live_presence
  where team_id = p_team_id and user_id = auth.uid()
  for update;
  if previous_update is not null and previous_update > now() - interval '5 seconds' then
    raise exception 'Live position updates are limited to one every 5 seconds' using errcode = '22023';
  end if;

  insert into public.team_live_presence (
    team_id, user_id, latitude, longitude, updated_at, expires_at
  ) values (
    p_team_id, auth.uid(), p_latitude, p_longitude, now(), now() + interval '90 seconds'
  )
  on conflict (team_id, user_id) do update set
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    updated_at = excluded.updated_at,
    expires_at = excluded.expires_at;
end;
$$;

create or replace function public.clear_team_live_presence(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  delete from public.team_live_presence
  where team_id = p_team_id and user_id = auth.uid();
end;
$$;

create or replace function public.clear_my_team_presence()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.team_live_presence where user_id = auth.uid();
$$;

revoke insert, update, delete on public.team_live_presence from authenticated;
revoke execute on function public.set_team_live_presence(uuid, double precision, double precision) from public, anon, authenticated;
revoke execute on function public.clear_team_live_presence(uuid) from public, anon, authenticated;
revoke execute on function public.clear_my_team_presence() from public, anon, authenticated;
grant execute on function public.set_team_live_presence(uuid, double precision, double precision) to authenticated;
grant execute on function public.clear_team_live_presence(uuid) to authenticated;
grant execute on function public.clear_my_team_presence() to authenticated;

revoke execute on function public.enforce_team_member_limit() from public, anon, authenticated;
revoke execute on function public.remove_team_contributions_on_membership_end() from public, anon, authenticated;
grant execute on function public.team_role_for(uuid, uuid) to authenticated;
grant execute on function public.is_active_team_member(uuid, uuid) to authenticated;
revoke execute on function public.respond_to_team_invitation(uuid, boolean, boolean) from public, anon;
grant execute on function public.respond_to_team_invitation(uuid, boolean, boolean) to authenticated;
revoke execute on function public.save_my_profile(text, text) from public, anon;
grant execute on function public.save_my_profile(text, text) to authenticated;