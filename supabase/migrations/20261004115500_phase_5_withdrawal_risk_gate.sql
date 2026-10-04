-- Phase 5 withdrawal risk gate
create or replace function public.request_withdrawal_by_source(p_user_id uuid,p_amount numeric,p_beneficiary_id uuid,p_source text,p_pin text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_risk public.zynth_risk_scores%rowtype; v_result jsonb; v_intent jsonb;
begin
 if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'AUTHORIZATION_REQUIRED'; end if;
 perform public.zynth_withdrawal_pin_check(p_pin);
 if not exists(select 1 from public.withdrawal_beneficiaries where id=p_beneficiary_id and user_id=p_user_id) then raise exception 'BENEFICIARY_NOT_FOUND'; end if;
 if exists(select 1 from public.withdrawal_beneficiaries where id=p_beneficiary_id and user_id=p_user_id and security_locked_until is not null and security_locked_until>now()) then raise exception 'BENEFICIARY_COOLING_DOWN'; end if;
 v_intent:=public.zynth_risk_record_system_event(p_user_id,'WITHDRAWAL_INTENT','withdrawal_security','beneficiary',p_beneficiary_id::text,null,null,null,jsonb_build_object('amount',p_amount,'source',p_source));
 select * into v_risk from public.zynth_risk_scores where user_id=p_user_id;
 if coalesce(v_risk.classification,'LOW')='CRITICAL' then
   insert into public.zynth_withdrawal_security_events(user_id,event_type,risk_score,metadata) values(p_user_id,'withdrawal_blocked_pin',coalesce(v_risk.score,0),jsonb_build_object('reason','CRITICAL_RISK_RESTRICTION'));
   raise exception 'WITHDRAWAL_RISK_REVIEW_REQUIRED';
 end if;
 v_result:=public.request_withdrawal_by_source(p_user_id,p_amount,p_beneficiary_id,p_source);
 if coalesce(v_risk.classification,'LOW')='HIGH' and coalesce((v_result->>'withdrawal_id'),'')<>'' then
   update public.withdrawal_requests set status='under_review',metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('risk_review_required',true,'risk_score',v_risk.score,'risk_classification',v_risk.classification) where id=(v_result->>'withdrawal_id')::uuid;
   v_result:=v_result||jsonb_build_object('status','under_review','risk_review_required',true);
 end if;
 return v_result;
end $$;