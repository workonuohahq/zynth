-- NOWPayments reconciliation must never process a payment whose ZYNTH deposit
-- request is no longer pending. This prevents cancelled requests from becoming
-- reconciliation candidates and closes an old-payment crediting path.

create or replace function public.get_nowpayments_reconciliation_candidates(p_limit integer default 25)
returns table(
  id uuid,
  deposit_id uuid,
  nowpayments_payment_id text,
  order_id text,
  payment_status text,
  pay_currency text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  headers_raw text := current_setting('request.headers', true);
  provided text;
begin
  provided := case when headers_raw is null or headers_raw='' then null
                   else headers_raw::json->>'x-zynth-runtime-secret' end;

  if provided is null
     or encode(digest(provided,'sha256'),'hex') <> '2d0362aa51a1c5898bb65fee31478b9267f612519d54c2a9a8ae58b309a741e1' then
    raise exception 'UNAUTHORIZED';
  end if;

  return query
  select cp.id, cp.deposit_id, cp.nowpayments_payment_id, cp.order_id,
         cp.payment_status, cp.pay_currency, cp.updated_at
  from public.zynth_crypto_payments cp
  join public.deposit_requests d on d.id=cp.deposit_id
  where cp.nowpayments_payment_id is not null
    and d.status='pending'
    and cp.payment_status not in ('finished','failed','expired','refunded')
  order by cp.updated_at asc
  limit greatest(1, least(coalesce(p_limit,25),100));
end;
$function$;

revoke all on function public.get_nowpayments_reconciliation_candidates(integer) from public, anon, authenticated;
grant execute on function public.get_nowpayments_reconciliation_candidates(integer) to anon;

update public.zynth_crypto_payments cp
set payment_status='expired',
    failure_reason='Associated ZYNTH deposit request was cancelled before payment completion.',
    updated_at=now()
from public.deposit_requests d
where d.id=cp.deposit_id
  and d.status<>'pending'
  and cp.payment_status not in ('finished','failed','expired','refunded');
