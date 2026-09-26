-- Keep large team-cell synchronization out of repeated RLS-filtered REST queries.
create index if not exists team_explored_cells_team_user_h3_idx
  on public.team_explored_cells (team_id, user_id, h3);

create or replace function public.get_team_cells(p_team_id uuid)
returns table (h3 text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_active_team_member(p_team_id) then
    raise exception 'Active team membership required' using errcode = '42501';
  end if;

  return query
    select distinct cells.h3
    from public.team_explored_cells cells
    join public.team_memberships contributor
      on contributor.team_id = cells.team_id
      and contributor.user_id = cells.user_id
      and contributor.status = 'active'
    where cells.team_id = p_team_id
    order by cells.h3;
end;
$$;

create or replace function public.add_team_cells(p_team_id uuid, p_cells jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_active_team_member(p_team_id) then
    raise exception 'Active team membership required' using errcode = '42501';
  end if;
  if p_cells is null or jsonb_typeof(p_cells) <> 'array' then
    raise exception 'Team cells must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_cells) > 500 then
    raise exception 'Team cell batches cannot exceed 500 cells' using errcode = '22023';
  end if;

  insert into public.team_explored_cells (team_id, h3, user_id)
  select p_team_id, cell.h3, auth.uid()
  from jsonb_array_elements_text(p_cells) as cell(h3)
  on conflict (team_id, h3, user_id) do nothing;
end;
$$;

revoke execute on function public.get_team_cells(uuid) from public, anon;
revoke execute on function public.add_team_cells(uuid, jsonb) from public, anon;
grant execute on function public.get_team_cells(uuid) to authenticated;
grant execute on function public.add_team_cells(uuid, jsonb) to authenticated;