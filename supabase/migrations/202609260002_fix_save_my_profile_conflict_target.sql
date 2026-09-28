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
  on conflict on constraint profiles_pkey do update set
    display_name = excluded.display_name,
    avatar_url = excluded.avatar_url,
    updated_at = now();

  return query
    select p.user_id, p.username, p.username_normalized, p.username_claimed_at,
      p.display_name, p.avatar_url
    from public.profiles as p
    where p.user_id = auth.uid();
end;
$$;

revoke execute on function public.save_my_profile(text, text) from public, anon;
grant execute on function public.save_my_profile(text, text) to authenticated;