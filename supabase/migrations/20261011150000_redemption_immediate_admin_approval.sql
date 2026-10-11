-- ZYNTH redemption policy: administrator approval is the only release gate.
-- Keep legacy release_at columns for historical compatibility; new requests do not schedule release.
CREATE OR REPLACE FUNCTION public.zynth_request_redemption(p_user_id uuid, p_investment_id uuid, p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  inv public.zynth_investments%rowtype;
  s public.zynth_strategies%rowtype;
  st public.system_settings%rowtype;
  gross numeric;
  units numeric;
  fee numeric;
  net numeric;
  ref text;
  rid uuid;
  principal_part numeric;
  remaining_units numeric;
  remaining_value numeric;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN RAISE EXCEPTION 'AUTHORIZATION_REQUIRED'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
  SELECT * INTO st FROM public.system_settings WHERE id='00000000-0000-0000-0000-000000000001';
  IF NOT st.investment_enabled OR NOT st.strategy_exit_enabled THEN RAISE EXCEPTION 'REDEMPTIONS_DISABLED'; END IF;
  IF p_amount < st.exit_minimum_amount THEN RAISE EXCEPTION 'BELOW_MINIMUM_REDEMPTION'; END IF;
  SELECT * INTO inv FROM public.zynth_investments WHERE id=p_investment_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND OR inv.status <> 'active' THEN RAISE EXCEPTION 'INVESTMENT_UNAVAILABLE'; END IF;
  IF EXISTS (SELECT 1 FROM public.zynth_redemption_requests r WHERE r.investment_id=inv.id AND r.status IN ('pending','approved','processing')) THEN RAISE EXCEPTION 'REDEMPTION_PENDING'; END IF;
  SELECT * INTO s FROM public.zynth_strategies WHERE id=inv.strategy_id FOR UPDATE;
  IF NOT FOUND OR s.status NOT IN ('active','paused') THEN RAISE EXCEPTION 'STRATEGY_UNAVAILABLE'; END IF;
  gross := round(inv.current_value,2);
  IF s.minimum_liquidity_reserve IS NOT NULL AND coalesce(s.current_reported_balance,0)-p_amount < s.minimum_liquidity_reserve THEN RAISE EXCEPTION 'STRATEGY_LIQUIDITY_RESERVE_REQUIRED'; END IF;
  IF p_amount > gross THEN RAISE EXCEPTION 'INSUFFICIENT_INVESTMENT_VALUE'; END IF;
  IF NOT st.exit_allow_partial AND p_amount < gross THEN RAISE EXCEPTION 'FULL_REDEMPTION_ONLY'; END IF;
  IF p_amount >= gross THEN p_amount := gross; END IF;
  units := round(p_amount / nullif(s.nav,0),12);
  IF units <= 0 OR units > inv.units THEN RAISE EXCEPTION 'INVALID_REDEMPTION_UNITS'; END IF;
  fee := round(p_amount * st.exit_fee_pct / 100,2);
  net := round(p_amount-fee,2);
  ref := 'ZYN-RED-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
  principal_part := round(inv.principal_remaining * (units/nullif(inv.units,0)),8);
  remaining_units := round(inv.units-units,12);
  remaining_value := round(inv.current_value-p_amount,8);

  INSERT INTO public.zynth_redemption_requests(
    user_id,investment_id,strategy_id,reference,requested_amount,requested_units,nav,
    gross_amount,fee_pct,fee_amount,net_amount,release_at,metadata
  ) VALUES (
    p_user_id,inv.id,inv.strategy_id,ref,p_amount,units,s.nav,p_amount,st.exit_fee_pct,fee,net,NULL,
    jsonb_build_object('valuation_basis','latest_confirmed_nav','principal_redeemed',principal_part,'approval_model','admin_approval')
  ) RETURNING id INTO rid;

  UPDATE public.zynth_investments
    SET principal_remaining=greatest(0,principal_remaining-principal_part),
        units=remaining_units,current_value=remaining_value,
        status=CASE WHEN remaining_units<=0.000000000001 THEN 'withdrawn' ELSE 'active' END,
        updated_at=now()
    WHERE id=inv.id;
  UPDATE public.zynth_strategies SET total_units=greatest(0,total_units-units),updated_at=now() WHERE id=s.id;
  INSERT INTO public.zynth_investment_events(investment_id,user_id,strategy_id,event_type,amount,units,nav,metadata)
    VALUES(inv.id,p_user_id,inv.strategy_id,'redeemed',p_amount,units,s.nav,
      jsonb_build_object('gross',p_amount,'fee',fee,'net',net,'reference',ref,'principal_redeemed',principal_part,'approval_model','admin_approval'));
  INSERT INTO public.transactions(user_id,type,amount,status,reference,metadata)
    VALUES(p_user_id,'investment_redemption',p_amount,'pending',ref,
      jsonb_build_object('source','investment_redemption','redemption_id',rid,'investment_id',inv.id,'strategy_id',inv.strategy_id,'nav',s.nav,'units',units,'fee',fee,'net',net));
  INSERT INTO public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
    VALUES(auth.uid(),'investment.redemption_requested','zynth_redemption',rid,
      jsonb_build_object('investment_id',inv.id,'strategy_id',inv.strategy_id,'gross',p_amount,'fee',fee,'net',net,'units',units,'nav',s.nav,'approval_model','admin_approval'));
  INSERT INTO public.notifications(user_id,title,body,type,metadata)
    VALUES(p_user_id,'Redemption requested',
      'Your redemption request for ₦'||to_char(p_amount,'FM999G999G999G990D00')||
      ' was recorded at confirmed NAV ₦'||to_char(s.nav,'FM999G999G999G990D00')||
      '. The net proceeds of ₦'||to_char(net,'FM999G999G999G990D00')||
      ' will become available after administrator approval.',
      'investment',jsonb_build_object('redemption_id',rid,'gross',p_amount,'fee',fee,'net',net));
  RETURN jsonb_build_object('ok',true,'redemption_id',rid,'reference',ref,'gross_amount',p_amount,
    'fee_amount',fee,'net_amount',net,'nav',s.nav,'units',units,'release_at',NULL,'status','pending');
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'REDEMPTION_PENDING';
END;
$function$;

-- Immediate, idempotent approval: state transition and cash credit occur in one transaction.
CREATE OR REPLACE FUNCTION public.zynth_admin_redemption_action(
  p_admin_id uuid, p_redemption_id uuid, p_action text, p_reason text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r public.zynth_redemption_requests%rowtype;
  updated_row public.zynth_redemption_requests%rowtype;
  principal_restore numeric;
  credited_user uuid;
  ledger_transaction_id uuid;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_admin_id OR NOT public.zynth_has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'ADMIN_AUTHORIZATION_REQUIRED';
  END IF;
  SELECT * INTO r FROM public.zynth_redemption_requests WHERE id=p_redemption_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REDEMPTION_NOT_FOUND'; END IF;

  IF p_action IN ('approve','release') THEN
    IF r.status NOT IN ('pending','approved','processing') THEN RAISE EXCEPTION 'INVALID_REDEMPTION_STATE'; END IF;
    UPDATE public.zynth_redemption_requests
      SET status='released',
          approved_at=coalesce(approved_at,now()),
          processing_at=coalesce(processing_at,now()),
          released_at=now(),
          reviewed_by=coalesce(reviewed_by,auth.uid()),
          processed_by=auth.uid(),
          failure_reason=NULL
      WHERE id=r.id AND status IN ('pending','approved','processing')
      RETURNING * INTO updated_row;
    IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_REDEMPTION_STATE'; END IF;

    UPDATE public.users SET main_wallet_balance=coalesce(main_wallet_balance,0)+updated_row.net_amount,updated_at=now()
      WHERE id=updated_row.user_id RETURNING id INTO credited_user;
    IF NOT FOUND THEN RAISE EXCEPTION 'USER_NOT_FOUND'; END IF;

    UPDATE public.transactions
      SET status='completed',processed_at=now(),
          metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('approved_by',auth.uid(),'approved_at',now(),'net_amount',updated_row.net_amount,'fee_amount',updated_row.fee_amount)
      WHERE reference=updated_row.reference AND status <> 'failed'
      RETURNING id INTO ledger_transaction_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'REDEMPTION_TRANSACTION_NOT_FOUND'; END IF;

    IF updated_row.fee_amount > 0 THEN
      INSERT INTO public.transactions(user_id,type,amount,status,reference,metadata)
      VALUES(updated_row.user_id,'fee_deduction',updated_row.fee_amount,'completed',
        'ZYN-REDFEE-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),
        jsonb_build_object('source','investment_redemption','redemption_id',updated_row.id,
          'investment_id',updated_row.investment_id,'fee_pct',updated_row.fee_pct));
    END IF;

    INSERT INTO public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
      VALUES(auth.uid(),'investment.redemption.approved_and_released','zynth_redemption',updated_row.id,
        jsonb_build_object('gross',updated_row.gross_amount,'fee',updated_row.fee_amount,
          'net',updated_row.net_amount,'credited_user',credited_user,'released_at',updated_row.released_at));
    RETURN to_jsonb(updated_row);

  ELSIF p_action='reject' THEN
    IF r.status NOT IN ('pending','approved','processing') THEN RAISE EXCEPTION 'INVALID_REDEMPTION_STATE'; END IF;
    principal_restore := coalesce((r.metadata->>'principal_redeemed')::numeric,0);
    UPDATE public.zynth_investments
      SET units=units+r.requested_units,current_value=current_value+r.gross_amount,
          principal_remaining=principal_remaining+principal_restore,status='active',updated_at=now()
      WHERE id=r.investment_id;
    UPDATE public.zynth_strategies SET total_units=total_units+r.requested_units,updated_at=now() WHERE id=r.strategy_id;
    UPDATE public.zynth_redemption_requests
      SET status='rejected',failure_reason=coalesce(nullif(trim(p_reason),''),'Redemption rejected'),reviewed_by=auth.uid()
      WHERE id=r.id;
    UPDATE public.transactions
      SET status='failed',failure_reason=coalesce(nullif(trim(p_reason),''),'Redemption rejected'),processed_at=now()
      WHERE reference=r.reference AND status='pending';
    INSERT INTO public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
      VALUES(auth.uid(),'investment.redemption.rejected','zynth_redemption',r.id,jsonb_build_object('reason',p_reason));
    RETURN (SELECT to_jsonb(rr) FROM public.zynth_redemption_requests rr WHERE rr.id=r.id);
  ELSE
    RAISE EXCEPTION 'INVALID_REDEMPTION_ACTION';
  END IF;
END;
$function$;

-- Legacy scheduler entry point retained for compatibility, but automatic date-based releases are disabled.
CREATE OR REPLACE FUNCTION public.zynth_release_due_redemptions(p_user_id uuid DEFAULT NULL::uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN 0;
END;
$function$;

-- Queue reads must never cause money movement as a side effect.
CREATE OR REPLACE FUNCTION public.zynth_admin_redemption_queue(p_admin_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_admin_id OR NOT public.zynth_has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'ADMIN_AUTHORIZATION_REQUIRED';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(to_jsonb(x) ORDER BY x.requested_at DESC)
    FROM (
      SELECT rr.*,u.full_name,u.email,s.name AS strategy_name
      FROM public.zynth_redemption_requests rr
      JOIN public.users u ON u.id=rr.user_id
      JOIN public.zynth_strategies s ON s.id=rr.strategy_id
      ORDER BY rr.requested_at DESC
    ) x
  ),'[]'::jsonb);
END;
$function$;

UPDATE public.system_settings
SET exit_delay_hours=0, withdrawal_fee_pct=5, updated_at=now()
WHERE id='00000000-0000-0000-0000-000000000001';

COMMENT ON COLUMN public.system_settings.exit_delay_hours IS
  'Deprecated: redemption proceeds are credited immediately after administrator approval; this setting is ignored.';
COMMENT ON COLUMN public.zynth_redemption_requests.release_at IS
  'Legacy compatibility field only. New redemption requests do not schedule a release; admin approval credits Available Balance.';
