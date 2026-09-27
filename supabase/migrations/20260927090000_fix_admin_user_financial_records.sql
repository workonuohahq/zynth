create or replace function public.admin_get_user_detail(p_admin_user_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare result jsonb;
begin
 if auth.uid() is null or auth.uid()<>p_admin_user_id or not public.zynth_has_role(auth.uid(),'admin') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
 if not exists(select 1 from public.users where id=p_user_id) then raise exception 'USER_NOT_FOUND'; end if;
 select jsonb_build_object(
  'profile',(select jsonb_build_object('id',u.id,'email',u.email,'full_name',u.full_name,'role',u.role,'kyc_verified',u.kyc_verified,'account_status',u.account_status,'main_wallet_balance',u.main_wallet_balance,'locked_vault_balance',u.locked_vault_balance,'created_at',u.created_at,'updated_at',u.updated_at) from public.users u where u.id=p_user_id),
  'stats',jsonb_build_object(
   'investment_count',(select count(*) from public.zynth_investments where user_id=p_user_id),
   'portfolio_value',(select coalesce(sum(current_value),0) from public.zynth_investments where user_id=p_user_id and status='active'),
   'total_deposited',(select coalesce(sum(amount),0) from public.deposit_requests where user_id=p_user_id and status='confirmed'),
   'total_withdrawn',(select coalesce(sum(net_amount),0) from public.withdrawal_requests where user_id=p_user_id and status='paid'),
   'vault_count',(select count(*) from public.zynth_profit_lots where user_id=p_user_id and status<>'rejected'),
   'active_vaults',(select count(*) from public.zynth_profit_lots where user_id=p_user_id and status='locked'),
   'projected_profit',(select coalesce(sum(greatest(profit_amount-withdrawn_amount,0)),0) from public.zynth_profit_lots where user_id=p_user_id and status<>'rejected')
  ),
  'investments',coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at desc) from public.zynth_investments i where i.user_id=p_user_id),'[]'::jsonb),
  'vaults',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'investment_id',l.investment_id,'settlement_id',l.settlement_id,'strategy_id',l.strategy_id,'profit_amount',l.profit_amount,'generated_at',l.generated_at,'unlock_at',l.unlock_at,'withdrawn_amount',l.withdrawn_amount,'status',l.status,'created_at',l.created_at) order by l.created_at desc) from public.zynth_profit_lots l where l.user_id=p_user_id),'[]'::jsonb),
  'deposits',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'amount',d.amount,'method',d.method,'status',d.status,'reference',d.reference,'payment_reference',d.payment_reference,'user_note',d.user_note,'admin_note',d.admin_note,'created_at',d.created_at,'processed_at',d.processed_at,'processed_by',d.processed_by) order by d.created_at desc) from public.deposit_requests d where d.user_id=p_user_id),'[]'::jsonb),
  'withdrawals',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'transaction_id',w.transaction_id,'reference',w.reference,'gross_amount',w.gross_amount,'fee_amount',w.fee_amount,'net_amount',w.net_amount,'fee_pct',w.fee_pct,'currency',w.currency,'bank_name',w.bank_name,'account_name',w.account_name,'status',w.status,'failure_reason',w.failure_reason,'created_at',w.created_at,'reviewed_at',w.reviewed_at,'processing_at',w.processing_at,'paid_at',w.paid_at,'cancelled_at',w.cancelled_at,'withdrawal_source',w.withdrawal_source) order by w.created_at desc) from public.withdrawal_requests w where w.user_id=p_user_id),'[]'::jsonb),
  'transactions',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.transactions t where t.user_id=p_user_id),'[]'::jsonb),
  'notes',coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at desc) from public.admin_user_notes n where n.user_id=p_user_id),'[]'::jsonb),
  'activity',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from public.audit_logs a where a.target_id=p_user_id),'[]'::jsonb)
 ) into result;
 return result;
end;
$function$;