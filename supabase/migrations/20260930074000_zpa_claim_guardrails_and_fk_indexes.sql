create or replace function public.zynth_zpa_claim_code(p_user_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  c public.zynth_zpa_codes%rowtype;
  v_first boolean;
  a public.zynth_zpa_acquisitions%rowtype;
  v_enabled boolean;
begin
  if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'AUTHORIZATION_REQUIRED'; end if;
  select enabled into v_enabled from public.zynth_zpa_settings where id='00000000-0000-0000-0000-000000000001';
  if not coalesce(v_enabled,false) then raise exception 'ZPA_PROGRAM_DISABLED'; end if;
  if public.zynth_has_role(p_user_id,'zpa') then raise exception 'ZPA_USER_CANNOT_BE_ACQUIRED'; end if;
  if exists(select 1 from public.users where id=p_user_id and account_status<>'active') then raise exception 'ACCOUNT_NOT_ELIGIBLE'; end if;
  select * into c from public.zynth_zpa_codes where upper(code)=upper(trim(coalesce(p_code,''))) and active=true limit 1;
  if not found then raise exception 'INVALID_ZPA_CODE'; end if;
  if c.zpa_id=p_user_id then raise exception 'SELF_ZPA_ATTRIBUTION_NOT_ALLOWED'; end if;
  if not public.zynth_has_role(c.zpa_id,'zpa') then raise exception 'ZPA_NOT_ACTIVE'; end if;
  select exists(select 1 from public.zynth_investments where user_id=p_user_id) into v_first;
  if v_first then raise exception 'INVESTOR_ALREADY_INVESTED'; end if;
  select * into a from public.zynth_zpa_acquisitions where investor_id=p_user_id for update;
  if found then
    if a.zpa_id=c.zpa_id then return jsonb_build_object('ok',true,'already_attributed',true,'acquisition_id',a.id); end if;
    raise exception 'INVESTOR_ALREADY_ATTRIBUTED';
  end if;
  insert into public.zynth_zpa_acquisitions(zpa_id,investor_id,attribution_source,attribution_code_id)
  values(c.zpa_id,p_user_id,'zpa_code',c.id) returning * into a;
  insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
  values(p_user_id,'zpa.attribution_claimed','zpa_acquisition',a.id,jsonb_build_object('zpa_id',c.zpa_id,'investor_id',p_user_id,'source','zpa_code'));
  perform public.zynth_emit_notification(c.zpa_id,'zpa.attribution_claimed',jsonb_build_object('investor_id',p_user_id),'New investor attributed','A new investor has been attributed to your ZPA account. Their first qualifying investment will begin the qualification process.','success');
  return jsonb_build_object('ok',true,'acquisition_id',a.id,'zpa_id',c.zpa_id);
end;
$function$;

create index if not exists zynth_zpa_acquisitions_attribution_code_id_idx on public.zynth_zpa_acquisitions(attribution_code_id);
create index if not exists zynth_zpa_earnings_credited_transaction_id_idx on public.zynth_zpa_earnings(credited_transaction_id);
create index if not exists zynth_zpa_earnings_investment_id_idx on public.zynth_zpa_earnings(investment_id);
create index if not exists zynth_zpa_earnings_investor_id_idx on public.zynth_zpa_earnings(investor_id);
