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