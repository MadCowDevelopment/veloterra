create table if not exists public.landmark_discovery_areas (
  area_key text primary key,
  classification_version smallint not null,
  discovered_at timestamptz not null default now()
);

alter table public.landmark_discovery_areas enable row level security;
grant select, insert, update, delete on public.landmark_discovery_areas to service_role;

-- Existing request rows predate persistent coverage and cannot prove that their
-- larger legacy area was fully scanned.
delete from public.landmark_discovery_requests;

create or replace function public.claim_landmark_discovery(p_area_key text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_area_key is null or char_length(p_area_key) > 80 then
    raise exception 'Invalid discovery area' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.landmark_discovery_areas
    where area_key = p_area_key and classification_version = 1
  ) then
    return 'cached';
  end if;

  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
  if exists (
    select 1 from public.landmark_discovery_requests
    where user_id = auth.uid() and area_key = p_area_key and request_day = current_date
  ) then
    return 'cached';
  end if;

  select count(*) into request_count
  from public.landmark_discovery_requests
  where user_id = auth.uid() and request_day = current_date;
  if request_count >= 20 then
    raise exception 'Daily landmark discovery limit reached' using errcode = 'P0001';
  end if;

  insert into public.landmark_discovery_requests (user_id, area_key)
  values (auth.uid(), p_area_key);
  return 'claimed';
end;
$$;

grant execute on function public.claim_landmark_discovery(text) to authenticated;