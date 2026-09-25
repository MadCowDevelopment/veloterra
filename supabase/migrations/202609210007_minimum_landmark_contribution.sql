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

  if p_requested_amount < 10000 then
    raise exception 'The minimum contribution is 1 gold' using errcode = '22023';
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
  if account.balance < least(10000, target.cost_copper - target.total_contributed) then
    raise exception 'Insufficient balance for the minimum contribution' using errcode = 'P0001';
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