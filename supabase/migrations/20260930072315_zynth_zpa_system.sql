-- ZYNTH ZPA canonical migration (generated from the live project after remote application).\n-- Rules: first investment only, 10-day default qualification, 5% default capital incentive, monthly incremental milestones.\n\ncreate table if not exists public.zynth_zpa_settings (\n  id uuid primary key default '00000000-0000-0000-0000-000000000001',\n  enabled boolean not null default true,\n  qualification_period_days integer not null default 10,\n  settlement_period_days integer not null default 0,\n  capital_incentive_rate numeric(12,4) not null default 5,\n  timezone text not null default 'Africa/Lagos',\n  updated_at timestamptz not null default now(),\n  updated_by uuid references public.users(id) on delete set null\n);\n\ncreate table if not exists public.zynth_zpa_milestones (\n  id uuid primary key default gen_random_uuid(),\n  threshold integer not null,\n  reward_amount numeric(14,2) not null,\n  is_active boolean not null default true,\n  sort_order integer not null default 0,\n  created_at timestamptz not null default now(),\n  updated_at timestamptz not null default now()\n);\n\ncreate table if not exists public.zynth_zpa_codes (\n  id uuid primary key default gen_random_uuid(),\n  zpa_id uuid not null references public.users(id) on delete cascade,\n  code text not null unique,\n  active boolean not null default true,\n  created_at timestamptz not null default now(),\n  updated_at timestamptz not null default now()\n);\n\ncreate table if not exists public.zynth_zpa_acquisitions (\n  id uuid primary key default gen_random_uuid(),\n  zpa_id uuid not null references public.users(id) on delete restrict,\n  investor_id uuid not null references public.users(id) on delete restrict,\n  attribution_source text not null default 'zpa_code',\n  attribution_code_id uuid references public.zynth_zpa_codes(id) on delete set null,\n  attributed_at timestamptz not null default now(),\n  first_investment_id uuid references public.zynth_investments(id) on delete set null,\n  first_investment_amount numeric(14,2),\n  qualifying_started_at timestamptz,\n  qualification_due_at timestamptz,\n  qualified_at timestamptz,\n  cycle_month date,\n  status text not null default 'awaiting_investment',\n  failure_reason text,\n  created_at timestamptz not null default now(),\n  updated_at timestamptz not null default now()\n);\n\ncreate table if not exists public.zynth_zpa_earnings (\n  id uuid primary key default gen_random_uuid(),\n  zpa_id uuid not null references public.users(id) on delete restrict,\n  investor_id uuid references public.users(id) on delete set null,\n  acquisition_id uuid references public.zynth_zpa_acquisitions(id) on delete set null,\n  earning_type text not null,\n  status text not null,\n  amount numeric(14,2) not null,\n  qualifying_amount numeric(14,2) not null default 0,\n  rate numeric(12,4) not null default 0,\n  investment_id uuid references public.zynth_investments(id) on delete set null,\n  cycle_month date,\n  milestone_threshold integer,\n  milestone_reward numeric(14,2),\n  settlement_due_at timestamptz,\n  available_at timestamptz,\n  credited_transaction_id uuid references public.transactions(id) on delete set null,\n  created_at timestamptz not null default now(),\n  updated_at timestamptz not null default now(),\n  metadata jsonb not null default '{}'::jsonb\n);\n\nalter table public.zynth_zpa_settings add constraint zpa_settings_days_check check (qualification_period_days between 1 and 365);\nalter table public.zynth_zpa_settings add constraint zpa_settings_settlement_check check (settlement_period_days between 0 and 365);\nalter table public.zynth_zpa_settings add constraint zpa_settings_rate_check check (capital_incentive_rate between 0 and 100);\nalter table public.zynth_zpa_milestones add constraint zpa_milestones_threshold_check check (threshold > 0);\nalter table public.zynth_zpa_milestones add constraint zpa_milestones_reward_check check (reward_amount >= 0);\nalter table public.zynth_zpa_milestones add constraint zpa_milestones_threshold_key unique(threshold);\nalter table public.zynth_zpa_codes add constraint zpa_codes_zpa_key unique(zpa_id);\nalter table public.zynth_zpa_acquisitions add constraint zpa_acq_source_check check (attribution_source in ('zpa_code','admin'));\nalter table public.zynth_zpa_acquisitions add constraint zpa_acq_status_check check (status in ('awaiting_investment','qualifying','qualified','failed'));\nalter table public.zynth_zpa_acquisitions add constraint zpa_acq_investor_key unique(investor_id);\nalter table public.zynth_zpa_acquisitions add constraint zpa_acq_first_investment_key unique(first_investment_id);\nalter table public.zynth_zpa_earnings add constraint zpa_earn_type_check check (earning_type in ('capital_incentive','milestone'));\nalter table public.zynth_zpa_earnings add constraint zpa_earn_status_check check (status in ('qualifying','pending','month_end_withheld','available','failed','reversed'));\nalter table public.zynth_zpa_earnings add constraint zpa_earn_amount_check check (amount >= 0);\nalter table public.zynth_zpa_earnings add constraint zpa_earn_qual_amount_check check (qualifying_amount >= 0);\nalter table public.zynth_zpa_earnings add constraint zpa_earn_rate_check check (rate >= 0);\ncreate unique index if not exists zynth_zpa_capital_earning_unique on public.zynth_zpa_earnings(acquisition_id) where earning_type='capital_incentive';\ncreate unique index if not exists zynth_zpa_milestone_unique on public.zynth_zpa_earnings(zpa_id,cycle_month,milestone_threshold) where earning_type='milestone';\ncreate index if not exists zynth_zpa_acquisitions_zpa_status_idx on public.zynth_zpa_acquisitions(zpa_id,status,qualified_at desc);\ncreate index if not exists zynth_zpa_acquisitions_investor_idx on public.zynth_zpa_acquisitions(investor_id,status);\ncreate index if not exists zynth_zpa_earnings_zpa_status_idx on public.zynth_zpa_earnings(zpa_id,status,created_at desc);\ncreate index if not exists zynth_zpa_earnings_cycle_idx on public.zynth_zpa_earnings(cycle_month,zpa_id,earning_type);\ninsert into public.zynth_zpa_settings(id) values ('00000000-0000-0000-0000-000000000001') on conflict(id) do nothing;\ninsert into public.zynth_zpa_milestones(threshold,reward_amount,sort_order) values (50,30000,10),(80,20000,20),(120,30000,30),(150,40000,40) on conflict(threshold) do nothing;\n\nCREATE OR REPLACE FUNCTION public.zynth_admin_zpa_attribute(p_admin_id uuid, p_zpa_id uuid, p_investor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.zynth_zpa_acquisitions%rowtype;
begin
  if auth.uid() is null or auth.uid()<>p_admin_id or not public.zynth_has_role(auth.uid(),'admin') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
  if not public.zynth_has_role(p_zpa_id,'zpa') then raise exception 'USER_IS_NOT_ZPA'; end if;
  if p_zpa_id=p_investor_id then raise exception 'SELF_ZPA_ATTRIBUTION_NOT_ALLOWED'; end if;
  if exists(select 1 from public.zynth_investments where user_id=p_investor_id) then raise exception 'INVESTOR_ALREADY_INVESTED'; end if;
  if exists(select 1 from public.zynth_zpa_acquisitions where investor_id=p_investor_id) then raise exception 'INVESTOR_ALREADY_ATTRIBUTED'; end if;
  insert into public.zynth_zpa_acquisitions(zpa_id,investor_id,attribution_source)
  values(p_zpa_id,p_investor_id,'admin') returning * into a;
  insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
  values(auth.uid(),'zpa.attribution_admin','zpa_acquisition',a.id,jsonb_build_object('zpa_id',p_zpa_id,'investor_id',p_investor_id));
  return jsonb_build_object('ok',true,'acquisition_id',a.id);
end;
$function$
\n\nCREATE OR REPLACE FUNCTION public.zynth_admin_zpa_dashboard(p_admin_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.zynth_zpa_settings%rowtype;
begin
  if auth.uid() is null or auth.uid()<>p_admin_id or not public.zynth_has_role(p_admin_id,'admin') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
  select * into s from public.zynth_zpa_settings where id='00000000-0000-0000-0000-000000000001';
  perform public.zynth_process_zpa();
  return jsonb_build_object(
    'settings',to_jsonb(s),
    'milestones',(select coalesce(jsonb_agg(to_jsonb(m) order by m.threshold),'[]'::jsonb) from public.zynth_zpa_milestones m where m.is_active),
    'zpas',(select coalesce(jsonb_agg(x order by x.qualified_count desc,x.name),'[]'::jsonb) from (
      select u.id,u.full_name,u.email,u.account_status,
        (select count(*) from public.zynth_zpa_acquisitions a where a.zpa_id=u.id and a.status='qualified' and a.cycle_month=(date_trunc('month',now() at time zone s.timezone))::date) qualified_count,
        (select coalesce(sum(a.first_investment_amount),0) from public.zynth_zpa_acquisitions a where a.zpa_id=u.id and a.status='qualified') capital_acquired,
        (select coalesce(sum(e.amount),0) from public.zynth_zpa_earnings e where e.zpa_id=u.id and e.status='available') available,
        (select coalesce(sum(e.amount),0) from public.zynth_zpa_earnings e where e.zpa_id=u.id and e.status='pending') pending,
        (select coalesce(sum(e.amount),0) from public.zynth_zpa_earnings e where e.zpa_id=u.id and e.status='month_end_withheld') month_end_withheld,
        (select coalesce(sum(e.amount),0) from public.zynth_zpa_earnings e where e.zpa_id=u.id) total_earned
      from public.users u where public.zynth_has_role(u.id,'zpa')
    )x),
    'recent_earnings',(select coalesce(jsonb_agg(x order by x.created_at desc),'[]'::jsonb) from (
      select e.*,coalesce(u.full_name,'ZPA') zpa_name,coalesce(iu.full_name,'Investor') investor_name
      from public.zynth_zpa_earnings e join public.users u on u.id=e.zpa_id left join public.users iu on iu.id=e.investor_id
      order by e.created_at desc limit 100
    )x),
    'attribution_candidates',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',coalesce(u.full_name,'Unnamed'),'email',u.email) order by u.created_at desc),'[]'::jsonb)
      from public.users u
      where u.account_status='active'
        and not exists(select 1 from public.zynth_investments i where i.user_id=u.id)
        and not exists(select 1 from public.zynth_zpa_acquisitions a where a.investor_id=u.id)
        and not public.zynth_has_role(u.id,'admin')
    )
  );
end;
$function$
\n\nCREATE OR REPLACE FUNCTION public.zynth_admin_zpa_detail(p_admin_id uuid, p_zpa_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or auth.uid()<>p_admin_id or not public.zynth_has_role(p_admin_id,'admin') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
  if not public.zynth_has_role(p_zpa_id,'zpa') then raise exception 'USER_IS_NOT_ZPA'; end if;
  return jsonb_build_object(
    'profile',(select jsonb_build_object('id',u.id,'name',u.full_name,'email',u.email,'status',u.account_status,'appointed_at',(select min(assigned_at) from public.zynth_user_roles ur join public.zynth_roles r on r.id=ur.role_id where ur.user_id=u.id and r.key='zpa')) from public.users u where u.id=p_zpa_id),
    'acquisitions',(select coalesce(jsonb_agg(x order by x.attributed_at desc),'[]'::jsonb) from (select a.*,coalesce(u.full_name,'Investor') investor_name from public.zynth_zpa_acquisitions a join public.users u on u.id=a.investor_id where a.zpa_id=p_zpa_id limit 200)x),
    'earnings',(select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc),'[]'::jsonb) from public.zynth_zpa_earnings e where e.zpa_id=p_zpa_id limit 200),
    'withdrawals',(select coalesce(jsonb_agg(to_jsonb(w) order by w.created_at desc),'[]'::jsonb) from public.withdrawal_requests w where w.user_id=p_zpa_id limit 100)
  );
end;
$function$
\n\nCREATE OR REPLACE FUNCTION public.zynth_admin_zpa_milestones(p_admin_id uuid, p_milestones jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare item jsonb; v_threshold integer; v_reward numeric; v_order integer:=0;
begin
  if auth.uid() is null or auth.uid()<>p_admin_id or not public.zynth_has_role(p_admin_id,'admin') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
  if jsonb_typeof(coalesce(p_milestones,'[]'::jsonb))<>'array' then raise exception 'INVALID_MILESTONES'; end if;
  delete from public.zynth_zpa_milestones;
  for item in select * from jsonb_array_elements(p_milestones) loop
    v_threshold=(item->>'threshold')::integer; v_reward=round((item->>'reward_amount')::numeric,2); v_order:=v_order+10;
    if v_threshold<=0 or v_reward<0 then raise exception 'INVALID_MILESTONE'; end if;
    insert into public.zynth_zpa_milestones(threshold,reward_amount,sort_order) values(v_threshold,v_reward,v_order);
  end loop;
  if exists(select 1 from public.zynth_zpa_milestones a join public.zynth_zpa_milestones b on a.id<>b.id and a.threshold=b.threshold) then raise exception 'DUPLICATE_MILESTONE'; end if;
  if exists(select 1 from public.zynth_zpa_milestones a join public.zynth_zpa_milestones b on a.id<>b.id and a.threshold>b.threshold and a.sort_order<b.sort_order) then raise exception 'MILESTONES_MUST_BE_ORDERED'; end if;
  insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
  values(p_admin_id,'zpa.milestones_changed','zpa_milestones',null,jsonb_build_object('milestones',p_milestones));
  return (select coalesce(jsonb_agg(to_jsonb(m) order by m.threshold),'[]'::jsonb) from public.zynth_zpa_milestones m);
end;
$function$
\n\nCREATE OR REPLACE FUNCTION public.zynth_admin_zpa_settings(p_admin_id uuid, p_enabled boolean, p_qualification_days integer, p_settlement_days integer, p_capital_rate numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare before_json jsonb; after_json jsonb;
begin
  if auth.uid() is null or auth.uid()<>p_admin_id or not public.zynth_has_role(p_admin_id,'admin') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
  if p_qualification_days not between 1 and 365 then raise exception 'INVALID_QUALIFICATION_PERIOD'; end if;
  if p_settlement_days not between 0 and 365 then raise exception 'INVALID_SETTLEMENT_PERIOD'; end if;
  if p_capital_rate<0 or p_capital_rate>100 then raise exception 'INVALID_CAPITAL_RATE'; end if;
  select to_jsonb(s) into before_json from public.zynth_zpa_settings s where s.id='00000000-0000-0000-0000-000000000001';
  update public.zynth_zpa_settings set enabled=p_enabled,qualification_period_days=p_qualification_days,settlement_period_days=p_settlement_days,capital_incentive_rate=p_capital_rate,updated_at=now(),updated_by=p_admin_id where id='00000000-0000-0000-0000-000000000001';
  select to_jsonb(s) into after_json from public.zynth_zpa_settings s where s.id='00000000-0000-0000-0000-000000000001';
  insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
  values(p_admin_id,'zpa.settings_changed','zpa_settings','00000000-0000-0000-0000-000000000001',jsonb_build_object('before',before_json,'after',after_json));
  return after_json;
end;
$function$
\n\nCREATE OR REPLACE FUNCTION public.zynth_get_or_create_zpa_code(p_zpa_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_code text; v_key text;
begin
  if auth.uid() is null or auth.uid()<>p_zpa_id or not public.zynth_has_role(p_zpa_id,'zpa') then
    raise exception 'ZPA_ACCESS_REQUIRED';
  end if;
  select c.code into v_code from public.zynth_zpa_codes c where c.zpa_id=p_zpa_id and c.active=true;
  if v_code is not null then return v_code; end if;
  v_key:='ZPA-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  insert into public.zynth_zpa_codes(zpa_id,code) values(p_zpa_id,v_key)
  on conflict(zpa_id) do update set active=true
  returning code into v_code;
  return v_code;
end;
$function$
\n\nCREATE OR REPLACE FUNCTION public.zynth_process_zpa()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a record; e record; s public.zynth_zpa_settings%rowtype; m record; v_cycle date; v_count integer; v_available numeric; v_tx uuid; v_ref text; v_released numeric:=0; v_qualified integer:=0; v_failed integer:=0; v_milestones integer:=0;
begin
  select * into s from public.zynth_zpa_settings where id='00000000-0000-0000-0000-000000000001' for update;
  if not coalesce(s.enabled,false) then return jsonb_build_object('ok',true,'disabled',true); end if;

  for a in
    select * from public.zynth_zpa_acquisitions
    where status='qualifying' and qualification_due_at<=now()
    order by qualification_due_at
    for update
  loop
    if exists(select 1 from public.zynth_investments i where i.id=a.first_investment_id and i.user_id=a.investor_id and i.status='active') then
      v_cycle=(date_trunc('month',now() at time zone s.timezone))::date;
      update public.zynth_zpa_acquisitions
      set status='qualified',qualified_at=now(),cycle_month=v_cycle,updated_at=now()
      where id=a.id;

      update public.zynth_zpa_earnings
      set status='pending',
          settlement_due_at=now()+make_interval(days=>s.settlement_period_days),
          updated_at=now()
      where acquisition_id=a.id and earning_type='capital_incentive' and status='qualifying';

      v_qualified:=v_qualified+1;

      perform public.zynth_emit_notification(a.zpa_id,'zpa.investor_qualified',jsonb_build_object('investor_id',a.investor_id,'qualified_at',now()),'Investor qualified','An investor you acquired has completed the qualification period.','success');

      select count(*) into v_count from public.zynth_zpa_acquisitions
      where zpa_id=a.zpa_id and status='qualified' and cycle_month=v_cycle;

      for m in select * from public.zynth_zpa_milestones where is_active and threshold<=v_count order by threshold loop
        insert into public.zynth_zpa_earnings(
          zpa_id,earning_type,status,amount,cycle_month,milestone_threshold,milestone_reward,metadata
        ) values(
          a.zpa_id,'milestone','month_end_withheld',m.reward_amount,v_cycle,m.threshold,m.reward_amount,
          jsonb_build_object('qualified_investor_count',v_count,'incremental_reward',m.reward_amount,'rule','monthly_cycle')
        )
        on conflict (zpa_id,cycle_month,milestone_threshold) where earning_type='milestone' do nothing;
        if found then
          v_milestones:=v_milestones+1;
          perform public.zynth_emit_notification(a.zpa_id,'zpa.milestone_reached',jsonb_build_object('cycle_month',v_cycle,'threshold',m.threshold,'reward',m.reward_amount,'qualified_count',v_count),'Milestone reached','You reached '||m.threshold||' qualified investors this month. ₦'||to_char(m.reward_amount,'FM999,999,999,990.00')||' has been recorded and is held until month-end.','success');
        end if;
      end loop;
    else
      update public.zynth_zpa_acquisitions
      set status='failed',failure_reason='First investment did not remain active through the qualification period.',updated_at=now()
      where id=a.id;
      update public.zynth_zpa_earnings
      set status='failed',updated_at=now(),metadata=metadata||jsonb_build_object('failure_reason','Investment exited before qualification')
      where acquisition_id=a.id and earning_type='capital_incentive' and status='qualifying';
      v_failed:=v_failed+1;
      perform public.zynth_emit_notification(a.zpa_id,'zpa.investor_qualification_failed',jsonb_build_object('investor_id',a.investor_id),'Qualification failed','An acquired investor exited before completing the qualification period. No acquisition incentive was credited.','activity');
    end if;
  end loop;

  for e in
    select * from public.zynth_zpa_earnings
    where earning_type='capital_incentive' and status='pending' and settlement_due_at is not null and settlement_due_at<=now()
    order by settlement_due_at
    for update
  loop
    v_ref:='ZPA-CAP-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
    update public.users set main_wallet_balance=main_wallet_balance+e.amount,updated_at=now() where id=e.zpa_id;
    insert into public.transactions(user_id,type,amount,status,reference,metadata,processed_at)
    values(e.zpa_id,'zpa_commission',e.amount,'completed',v_ref,jsonb_build_object('zpa_earning_id',e.id,'earning_type','capital_incentive','investor_id',e.investor_id,'investment_id',e.investment_id,'rate',e.rate,'qualifying_amount',e.qualifying_amount),now())
    returning id into v_tx;
    update public.zynth_zpa_earnings set status='available',available_at=now(),credited_transaction_id=v_tx,updated_at=now() where id=e.id;
    insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
    values(e.zpa_id,'zpa.capital_incentive_credited','zpa_earning',e.id,jsonb_build_object('amount',e.amount,'transaction_id',v_tx,'reference',v_ref));
    perform public.zynth_emit_notification(e.zpa_id,'zpa.capital_incentive_credited',jsonb_build_object('amount',e.amount,'reference',v_ref),'Capital incentive credited','₦'||to_char(e.amount,'FM999,999,999,990.00')||' has been credited to your available balance.','success');
    v_released:=v_released+e.amount;
  end loop;

  for e in
    select * from public.zynth_zpa_earnings
    where earning_type='milestone' and status='month_end_withheld'
      and cycle_month < (date_trunc('month',now() at time zone s.timezone))::date
    order by cycle_month,created_at
    for update
  loop
    v_ref:='ZPA-MILE-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
    update public.users set main_wallet_balance=main_wallet_balance+e.amount,updated_at=now() where id=e.zpa_id;
    insert into public.transactions(user_id,type,amount,status,reference,metadata,processed_at)
    values(e.zpa_id,'zpa_commission',e.amount,'completed',v_ref,jsonb_build_object('zpa_earning_id',e.id,'earning_type','milestone','cycle_month',e.cycle_month,'threshold',e.milestone_threshold),now())
    returning id into v_tx;
    update public.zynth_zpa_earnings set status='available',available_at=now(),credited_transaction_id=v_tx,updated_at=now() where id=e.id;
    insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
    values(e.zpa_id,'zpa.milestone_released','zpa_earning',e.id,jsonb_build_object('amount',e.amount,'transaction_id',v_tx,'reference',v_ref,'cycle_month',e.cycle_month,'threshold',e.milestone_threshold));
    perform public.zynth_emit_notification(e.zpa_id,'zpa.milestone_released',jsonb_build_object('amount',e.amount,'cycle_month',e.cycle_month,'threshold',e.milestone_threshold),'Month-end incentive released','Your ₦'||to_char(e.amount,'FM999,999,999,990.00')||' monthly ZPA milestone incentive is now available.','success');
    v_released:=v_released+e.amount;
  end loop;

  return jsonb_build_object('ok',true,'qualified',v_qualified,'failed',v_failed,'milestones_created',v_milestones,'released',v_released);
end;
$function$
\n\nCREATE OR REPLACE FUNCTION public.zynth_qualify_referral_for_investment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.zynth_referrals%rowtype; s public.zynth_referral_settings%rowtype; reward numeric; rate numeric;
begin
  if exists(select 1 from public.zynth_zpa_acquisitions a where a.investor_id=new.user_id) then return new; end if;
  select * into r from public.zynth_referrals where referred_user_id=new.user_id and status not in ('rejected','rewarded') for update;
  if not found then return new; end if;
  select * into s from public.zynth_referral_settings where id='00000000-0000-0000-0000-000000000001';
  if not coalesce(s.enabled,false) or new.principal < s.min_qualifying_investment then return new; end if;
  if new.invested_at > r.attributed_at + make_interval(days=>s.qualification_window_days) then return new; end if;
  if exists(select 1 from public.zynth_referral_rewards where referral_id=r.id and trigger_event='first_qualifying_investment') then return new; end if;
  if (select count(*) from public.zynth_referrals where referrer_id=r.referrer_id and status in ('qualified','reward_pending','rewarded')) >= s.max_rewards_per_referrer then return new; end if;
  rate:=case when s.percent_reward>0 then s.percent_reward else 0 end;
  reward:=case when rate>0 then least(new.principal*(rate/100),s.reward_cap) else least(s.fixed_reward,s.reward_cap) end;
  update public.zynth_referrals set status='reward_pending',qualified_at=now(),updated_at=now() where id=r.id;
  insert into public.zynth_referral_rewards(referral_id,referrer_id,referred_user_id,source_investment_id,qualifying_amount,reward_rate,reward_amount)
  values(r.id,r.referrer_id,r.referred_user_id,new.id,new.principal,rate,reward);
  perform public.zynth_emit_notification(r.referrer_id,'referral.qualified',jsonb_build_object('qualifying_amount',new.principal,'reward_amount',reward),'Referral qualified','Your referral qualified with an investment of ₦'||to_char(new.principal,'FM999,999,990.00')||'. Your reward is now pending review.','success');
  return new;
end;
$function$
\n\nCREATE OR REPLACE FUNCTION public.zynth_zpa_claim_code(p_user_id uuid, p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.zynth_zpa_codes%rowtype; v_first boolean; a public.zynth_zpa_acquisitions%rowtype; v_enabled boolean;
begin
 if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'AUTHORIZATION_REQUIRED'; end if;
 select enabled into v_enabled from public.zynth_zpa_settings where id='00000000-0000-0000-0000-000000000001';
 if not coalesce(v_enabled,false) then raise exception 'ZPA_PROGRAM_DISABLED'; end if;
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
$function$
\n\nCREATE OR REPLACE FUNCTION public.zynth_zpa_dashboard(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.zynth_zpa_settings%rowtype; v_code text; v_cycle date; v_next integer; v_next_reward numeric;
begin
  if auth.uid() is null or auth.uid()<>p_user_id or not public.zynth_has_role(p_user_id,'zpa') then raise exception 'ZPA_ACCESS_REQUIRED'; end if;
  perform public.zynth_process_zpa();
  select * into s from public.zynth_zpa_settings where id='00000000-0000-0000-0000-000000000001';
  select public.zynth_get_or_create_zpa_code(p_user_id) into v_code;
  v_cycle=(date_trunc('month',now() at time zone s.timezone))::date;
  select m.threshold,m.reward_amount into v_next,v_next_reward
  from public.zynth_zpa_milestones m
  where m.is_active and m.threshold > (select count(*) from public.zynth_zpa_acquisitions a where a.zpa_id=p_user_id and a.status='qualified' and a.cycle_month=v_cycle)
  order by m.threshold limit 1;
  return jsonb_build_object(
    'enabled',s.enabled,
    'settings',jsonb_build_object('qualification_period_days',s.qualification_period_days,'settlement_period_days',s.settlement_period_days,'capital_incentive_rate',s.capital_incentive_rate,'timezone',s.timezone),
    'code',v_code,'link','/login?mode=signup&zpa='||v_code,
    'cycle_month',v_cycle,
    'qualified_investors',(select count(*) from public.zynth_zpa_acquisitions a where a.zpa_id=p_user_id and a.status='qualified' and a.cycle_month=v_cycle),
    'monthly_target',coalesce(v_next,0),
    'next_milestone',v_next,
    'next_reward',coalesce(v_next_reward,0),
    'qualified_capital',(select coalesce(sum(first_investment_amount),0) from public.zynth_zpa_acquisitions a where a.zpa_id=p_user_id and a.status='qualified'),
    'available',(select coalesce(sum(amount),0) from public.zynth_zpa_earnings e where e.zpa_id=p_user_id and e.status='available'),
    'qualifying',(select coalesce(sum(amount),0) from public.zynth_zpa_earnings e where e.zpa_id=p_user_id and e.status='qualifying'),
    'pending',(select coalesce(sum(amount),0) from public.zynth_zpa_earnings e where e.zpa_id=p_user_id and e.status='pending'),
    'month_end_withheld',(select coalesce(sum(amount),0) from public.zynth_zpa_earnings e where e.zpa_id=p_user_id and e.status='month_end_withheld'),
    'capital_incentives_earned',(select coalesce(sum(amount),0) from public.zynth_zpa_earnings e where e.zpa_id=p_user_id and e.earning_type='capital_incentive' and e.status<>'failed'),
    'milestone_incentives_earned',(select coalesce(sum(amount),0) from public.zynth_zpa_earnings e where e.zpa_id=p_user_id and e.earning_type='milestone' and e.status<>'reversed'),
    'total_paid',(select coalesce(sum(amount),0) from public.zynth_zpa_earnings e where e.zpa_id=p_user_id and e.status='available'),
    'acquisitions',(select coalesce(jsonb_agg(x order by x.attributed_at desc),'[]'::jsonb) from (select a.id,a.investor_id,a.status,a.first_investment_amount,a.qualifying_started_at,a.qualification_due_at,a.qualified_at,a.failure_reason,coalesce(u.full_name,'ZYNTH investor') investor_name from public.zynth_zpa_acquisitions a join public.users u on u.id=a.investor_id where a.zpa_id=p_user_id limit 100)x),
    'earnings',(select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc),'[]'::jsonb) from public.zynth_zpa_earnings e where e.zpa_id=p_user_id limit 100)
  );
end;
$function$
\n\nCREATE OR REPLACE FUNCTION public.zynth_zpa_on_first_investment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.zynth_zpa_acquisitions%rowtype; s public.zynth_zpa_settings%rowtype; e public.zynth_zpa_earnings%rowtype; v_prior_count integer;
begin
  if exists(select 1 from public.zynth_investments where user_id=new.user_id and id<>new.id) then return new; end if;
  select * into a from public.zynth_zpa_acquisitions where investor_id=new.user_id and status='awaiting_investment' for update;
  if not found then return new; end if;
  select * into s from public.zynth_zpa_settings where id='00000000-0000-0000-0000-000000000001';
  if not coalesce(s.enabled,false) then return new; end if;
  update public.zynth_zpa_acquisitions
  set first_investment_id=new.id,
      first_investment_amount=new.principal,
      qualifying_started_at=coalesce(new.invested_at,new.created_at),
      qualification_due_at=coalesce(new.invested_at,new.created_at)+make_interval(days=>s.qualification_period_days),
      status='qualifying',
      updated_at=now()
  where id=a.id
  returning * into a;
  insert into public.zynth_zpa_earnings(
    zpa_id,investor_id,acquisition_id,earning_type,status,amount,qualifying_amount,rate,investment_id,settlement_due_at,metadata
  ) values(
    a.zpa_id,a.investor_id,a.id,'capital_incentive','qualifying',
    round(new.principal*s.capital_incentive_rate/100,2),new.principal,s.capital_incentive_rate,new.id,null,
    jsonb_build_object('rule','first_qualifying_investment_only','rate_snapshot',s.capital_incentive_rate,'qualification_period_days',s.qualification_period_days,'investment_id',new.id)
  )
  on conflict do nothing returning * into e;
  insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
  values(a.zpa_id,'zpa.first_investment_qualifying','zpa_acquisition',a.id,jsonb_build_object('investor_id',a.investor_id,'investment_id',new.id,'amount',new.principal,'capital_incentive',coalesce(e.amount,0),'rate',s.capital_incentive_rate,'qualification_due_at',a.qualification_due_at));
  perform public.zynth_emit_notification(a.zpa_id,'zpa.investment_qualifying',jsonb_build_object('investor_id',a.investor_id,'amount',new.principal,'due_at',a.qualification_due_at),'Investor is qualifying','A newly acquired investor has made their first investment. The qualification period is now running.','activity');
  return new;
end;
$function$
\n\nrevoke all on function public.zynth_get_or_create_zpa_code(uuid),public.zynth_zpa_claim_code(uuid,text),public.zynth_zpa_dashboard(uuid),public.zynth_admin_zpa_attribute(uuid,uuid,uuid),public.zynth_admin_zpa_dashboard(uuid),public.zynth_admin_zpa_settings(uuid,boolean,integer,integer,numeric),public.zynth_admin_zpa_milestones(uuid,jsonb),public.zynth_admin_zpa_detail(uuid,uuid) from public,anon,authenticated;\ngrant execute on function public.zynth_get_or_create_zpa_code(uuid),public.zynth_zpa_claim_code(uuid,text),public.zynth_zpa_dashboard(uuid) to authenticated;\ngrant execute on function public.zynth_admin_zpa_attribute(uuid,uuid,uuid),public.zynth_admin_zpa_dashboard(uuid),public.zynth_admin_zpa_settings(uuid,boolean,integer,integer,numeric),public.zynth_admin_zpa_milestones(uuid,jsonb),public.zynth_admin_zpa_detail(uuid,uuid) to authenticated;\nrevoke execute on function public.zynth_process_zpa() from public,anon,authenticated;\nrevoke execute on function public.zynth_zpa_on_first_investment() from public,anon,authenticated;\nalter table public.zynth_zpa_settings enable row level security;\nalter table public.zynth_zpa_milestones enable row level security;\nalter table public.zynth_zpa_codes enable row level security;\nalter table public.zynth_zpa_acquisitions enable row level security;\nalter table public.zynth_zpa_earnings enable row level security;\ncreate policy if not exists "zpa settings deny direct" on public.zynth_zpa_settings for all to authenticated using(false) with check(false);\ncreate policy if not exists "zpa milestones deny direct" on public.zynth_zpa_milestones for all to authenticated using(false) with check(false);\ncreate policy if not exists "zpa own code" on public.zynth_zpa_codes for select to authenticated using((select auth.uid())=zpa_id);\ncreate policy if not exists "zpa own acquisitions" on public.zynth_zpa_acquisitions for select to authenticated using((select auth.uid())=zpa_id);\ncreate policy if not exists "zpa own earnings" on public.zynth_zpa_earnings for select to authenticated using((select auth.uid())=zpa_id);\nrevoke all on public.zynth_zpa_settings,public.zynth_zpa_milestones,public.zynth_zpa_codes,public.zynth_zpa_acquisitions,public.zynth_zpa_earnings from authenticated,anon;\n\ndrop trigger if exists trg_zynth_zpa_first_investment on public.zynth_investments;\nCREATE TRIGGER trg_zynth_zpa_first_investment AFTER INSERT ON public.zynth_investments FOR EACH ROW EXECUTE FUNCTION zynth_zpa_on_first_investment();\n\n-- The processor is scheduled every 15 minutes in Supabase Cron.\ndo $$ begin if exists(select 1 from cron.job where jobname='zynth-zpa-processor') then perform cron.unschedule((select jobid from cron.job where jobname='zynth-zpa-processor' limit 1)); end if; perform cron.schedule('zynth-zpa-processor','*/15 * * * *','select public.zynth_process_zpa();'); end $$;\n