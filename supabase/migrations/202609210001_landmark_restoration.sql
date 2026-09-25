create extension if not exists pgcrypto;

create table if not exists public.wallet (
  user_id uuid primary key references auth.users on delete cascade,
  balance bigint not null default 0,
  total_distance_m double precision not null default 0,
  rides_count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.wallet add column if not exists lifetime_earned bigint;
alter table public.wallet add column if not exists spent bigint not null default 0;

update public.wallet
set lifetime_earned = greatest(coalesce(lifetime_earned, 0), balance + spent)
where lifetime_earned is null or lifetime_earned < balance + spent;

alter table public.wallet alter column lifetime_earned set default 0;
alter table public.wallet alter column lifetime_earned set not null;

alter table public.wallet drop constraint if exists wallet_lifetime_earned_nonnegative;
alter table public.wallet add constraint wallet_lifetime_earned_nonnegative check (lifetime_earned >= 0);
alter table public.wallet drop constraint if exists wallet_spent_nonnegative;
alter table public.wallet add constraint wallet_spent_nonnegative check (spent >= 0 and spent <= lifetime_earned);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  avatar_url text,
  updated_at timestamptz not null default now()
);

create table if not exists public.landmarks (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null unique,
  osm_type text not null check (osm_type in ('node', 'way', 'relation')),
  osm_id bigint not null,
  name text not null,
  category text not null check (category in (
    'church', 'chapel', 'castle', 'ruins', 'monument', 'museum', 'artwork',
    'civic', 'heritage', 'tower', 'bridge', 'mill', 'industrial', 'lighthouse',
    'viewpoint', 'mountain', 'natural', 'water', 'garden', 'landmark'
  )),
  tier smallint not null check (tier between 1 and 4),
  scope_multiplier smallint not null check (scope_multiplier in (1, 2, 5, 10)),
  cost_copper bigint not null check (cost_copper > 0),
  total_contributed bigint not null default 0 check (total_contributed >= 0),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  wikidata text,
  wikipedia text,
  osm_tags jsonb not null default '{}'::jsonb,
  classification_version smallint not null default 1,
  restored_at timestamptz,
  discovered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (osm_type, osm_id),
  check (total_contributed <= cost_copper),
  check ((total_contributed = cost_copper) = (restored_at is not null))
);

create index if not exists landmarks_location_idx on public.landmarks (latitude, longitude);
create index if not exists landmarks_progress_idx on public.landmarks (restored_at, tier desc);

create table if not exists public.landmark_contributions (
  id uuid primary key default gen_random_uuid(),
  landmark_id uuid not null references public.landmarks on delete restrict,
  user_id uuid not null references auth.users on delete restrict,
  amount bigint not null check (amount > 0),
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index if not exists landmark_contributions_landmark_idx
  on public.landmark_contributions (landmark_id, created_at desc);

create table if not exists public.landmark_discovery_requests (
  user_id uuid not null references auth.users on delete cascade,
  area_key text not null,
  request_day date not null default current_date,
  requested_at timestamptz not null default now(),
  primary key (user_id, area_key, request_day)
);

alter table public.profiles enable row level security;
alter table public.landmarks enable row level security;
alter table public.landmark_contributions enable row level security;
alter table public.landmark_discovery_requests enable row level security;
alter table public.wallet enable row level security;

create policy "authenticated profiles are visible"
  on public.profiles for select to authenticated using (true);
create policy "users manage their profile"
  on public.profiles for insert to authenticated with check (auth.uid() = user_id);
create policy "users update their profile"
  on public.profiles for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "authenticated landmarks are visible"
  on public.landmarks for select to authenticated using (true);
create policy "authenticated contributions are visible"
  on public.landmark_contributions for select to authenticated using (true);
drop policy if exists "own wallet" on public.wallet;
create policy "users read their wallet"
  on public.wallet for select to authenticated using (auth.uid() = user_id);

revoke insert, update, delete on public.wallet from authenticated;
grant select on public.wallet, public.profiles, public.landmarks, public.landmark_contributions to authenticated;
grant insert, update on public.profiles to authenticated;

create or replace function public.sync_wallet_progress(
  p_lifetime_earned bigint,
  p_total_distance_m double precision,
  p_rides_count integer
) returns public.wallet
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.wallet;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_lifetime_earned < 0 or p_total_distance_m < 0 or p_rides_count < 0 then
    raise exception 'Wallet progress cannot be negative' using errcode = '22023';
  end if;

  insert into public.wallet (
    user_id, balance, lifetime_earned, spent, total_distance_m, rides_count, updated_at
  ) values (
    auth.uid(), p_lifetime_earned, p_lifetime_earned, 0,
    p_total_distance_m, p_rides_count, now()
  )
  on conflict (user_id) do update set
    lifetime_earned = greatest(public.wallet.lifetime_earned, excluded.lifetime_earned),
    balance = greatest(public.wallet.lifetime_earned, excluded.lifetime_earned) - public.wallet.spent,
    total_distance_m = greatest(public.wallet.total_distance_m, excluded.total_distance_m),
    rides_count = greatest(public.wallet.rides_count, excluded.rides_count),
    updated_at = now()
  returning * into result;

  return result;
end;
$$;

create or replace function public.contribute_to_landmark(
  p_landmark_id uuid,
  p_requested_amount bigint,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.landmarks;
  account public.wallet;
  existing_amount bigint;
  applied_amount bigint;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_requested_amount <= 0 then
    raise exception 'Contribution must be positive' using errcode = '22023';
  end if;

  select amount into existing_amount
  from public.landmark_contributions
  where user_id = auth.uid() and idempotency_key = p_idempotency_key;

  if existing_amount is not null then
    select * into target from public.landmarks where id = p_landmark_id;
    select * into account from public.wallet where user_id = auth.uid();
    return jsonb_build_object(
      'applied_amount', existing_amount,
      'balance', account.balance,
      'lifetime_earned', account.lifetime_earned,
      'spent', account.spent,
      'total_contributed', target.total_contributed,
      'restored_at', target.restored_at
    );
  end if;

  select * into account
  from public.wallet
  where user_id = auth.uid()
  for update;
  if account is null or account.balance <= 0 then
    raise exception 'Insufficient balance' using errcode = 'P0001';
  end if;

  select * into target
  from public.landmarks
  where id = p_landmark_id
  for update;
  if target is null then
    raise exception 'Landmark not found' using errcode = 'P0002';
  end if;
  if target.restored_at is not null then
    raise exception 'Landmark is already restored' using errcode = 'P0001';
  end if;

  applied_amount := least(
    p_requested_amount,
    account.balance,
    target.cost_copper - target.total_contributed
  );

  update public.wallet set
    spent = spent + applied_amount,
    balance = balance - applied_amount,
    updated_at = now()
  where user_id = auth.uid()
  returning * into account;

  update public.landmarks set
    total_contributed = total_contributed + applied_amount,
    restored_at = case
      when total_contributed + applied_amount = cost_copper then now()
      else null
    end,
    updated_at = now()
  where id = p_landmark_id
  returning * into target;

  insert into public.landmark_contributions (
    landmark_id, user_id, amount, idempotency_key
  ) values (
    p_landmark_id, auth.uid(), applied_amount, p_idempotency_key
  );

  return jsonb_build_object(
    'applied_amount', applied_amount,
    'balance', account.balance,
    'lifetime_earned', account.lifetime_earned,
    'spent', account.spent,
    'total_contributed', target.total_contributed,
    'restored_at', target.restored_at
  );
end;
$$;

create or replace function public.get_landmark_contributors(p_landmark_id uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  amount bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    contributions.user_id,
    coalesce(profiles.display_name, 'VeloTerra rider') as display_name,
    profiles.avatar_url,
    sum(contributions.amount)::bigint as amount
  from public.landmark_contributions contributions
  left join public.profiles profiles on profiles.user_id = contributions.user_id
  where auth.uid() is not null and contributions.landmark_id = p_landmark_id
  group by contributions.user_id, profiles.display_name, profiles.avatar_url
  order by amount desc, display_name
  limit 20;
$$;

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

grant execute on function public.sync_wallet_progress(bigint, double precision, integer) to authenticated;
grant execute on function public.contribute_to_landmark(uuid, bigint, uuid) to authenticated;
grant execute on function public.get_landmark_contributors(uuid) to authenticated;
grant execute on function public.claim_landmark_discovery(text) to authenticated;

alter publication supabase_realtime add table public.landmarks;
