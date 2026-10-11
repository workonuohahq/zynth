-- ZYNTH Vault redesign: investment profits must be redeemed before withdrawal.
-- Preserve profit lots as settlement/maturity history; remove them as a cash source.
-- Available Balance remains backed by the existing main_wallet_balance and redemption release engine.

create or replace function public.zynth_withdrawable_balances(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  wallet numeric := 0;
  zpa numeric := 0;
  has_zpa boolean := false;
  state text;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'AUTHORIZATION_REQUIRED';
  end if;

  select u.main_wallet_balance, u.account_status
    into wallet, state
  from public.users u
  where u.id = p_user_id;

  if not found then raise exception 'USER_NOT_FOUND'; end if;
  if state in ('restricted','suspended','deactivated') then
    raise exception 'ACCOUNT_RESTRICTED';
  end if;

  has_zpa := public.zynth_has_role(p_user_id,'zpa');
  if has_zpa then
    select coalesce(sum(greatest(e.amount-e.withdrawn_amount,0))
      filter (where e.status='available' and e.withdrawn_amount < e.amount),0)
      into zpa
    from public.zynth_zpa_earnings e
    where e.zpa_id=p_user_id;
  end if;

  return jsonb_build_object(
    'has_zpa', has_zpa,
    'vault_profit', 0,
    'available_cash', coalesce(wallet,0),
    'zpa_earnings', coalesce(zpa,0),
    'total_withdrawable', coalesce(wallet,0)+coalesce(zpa,0)
  );
end;
$$;

-- Keep the existing authenticated API contract, but prevent direct profit-lot withdrawal.
create or replace function public.request_profit_withdrawal(
  p_user_id uuid,
  p_amount numeric,
  p_beneficiary_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'AUTHORIZATION_REQUIRED';
  end if;
  raise exception 'REDEMPTION_REQUIRED_FOR_INVESTMENT_PROFITS';
end;
$$;

create or replace function public.request_profit_withdrawal_unchecked(
  p_user_id uuid,
  p_amount numeric,
  p_beneficiary_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
begin
  raise exception 'REDEMPTION_REQUIRED_FOR_INVESTMENT_PROFITS';
end;
$$;

-- Harden the canonical withdrawal engine. ZPA earnings remain separate; 'profit'
-- and 'all' can no longer draw from profit lots or mix them with cash.
do $migration$
declare
  v_signature regprocedure := 'public.request_withdrawal_by_source(uuid,numeric,uuid,text)'::regprocedure;
  v_definition text;
  v_patched text;
begin
  v_definition := pg_get_functiondef(v_signature);
  v_patched := replace(
    v_definition,
    'if source not in (''cash'',''profit'',''zpa'',''all'') then',
    'if source not in (''cash'',''zpa'') then'
  );
  if v_patched = v_definition then
    raise exception 'Could not safely patch request_withdrawal_by_source source guard';
  end if;
  execute v_patched;
end;
$migration$;

revoke execute on function public.zynth_withdrawable_balances(uuid) from public, anon;
grant execute on function public.zynth_withdrawable_balances(uuid) to authenticated;

-- Explicitly preserve the historical lock/maturity ledger. It is not an available-cash wallet.
comment on column public.users.locked_vault_balance is
  'Legacy compatibility field retained during Vault migration; not authoritative available cash. Do not use for withdrawals. Profit maturity is tracked by zynth_profit_lots.';
