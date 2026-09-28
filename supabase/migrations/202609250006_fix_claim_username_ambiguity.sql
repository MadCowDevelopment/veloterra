-- Qualify columns that overlap with claim_username's OUT parameters.
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

  select p.* into current_profile
  from public.profiles as p
  where p.user_id = auth.uid()
  for update;
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

  select c.* into existing_claim
  from public.username_claims as c
  where c.username_normalized = normalized;
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
    from public.profiles as p
    where p.user_id = auth.uid();
end;
$$;

revoke execute on function public.claim_username(text) from public, anon;
grant execute on function public.claim_username(text) to authenticated;
