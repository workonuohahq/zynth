create or replace function public.zynth_zpa_dashboard(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare s public.zynth_zpa_settings%rowtype; v_code text; v_cycle date; v_next integer; v_next_reward numeric;
begin
 if auth.uid() is null or auth.uid()<>p_user_id or not public.zynth_has_role(p_user_id,'zpa') then raise exception 'ZPA_ACCESS_REQUIRED'; end if;
 perform public.zynth_process_zpa();
 select * into s from public.zynth_zpa_settings where id='00000000-0000-0000-0000-000000000001';
 select public.zynth_get_or_create_zpa_code(p_user_id) into v_code;
 v_cycle=(date_trunc('month',now() at time zone s.timezone))::date;
 select m.threshold,m.reward_amount into v_next,v_next_reward from public.zynth_zpa_milestones m where m.is_active and m.threshold > (select count(*) from public.zynth_zpa_acquisitions a where a.zpa_id=p_user_id and a.status='qualified' and a.cycle_month=v_cycle) order by m.threshold limit 1;
 return jsonb_build_object(
  'enabled',s.enabled,'settings',jsonb_build_object('qualification_period_days',s.qualification_period_days,'settlement_period_days',s.settlement_period_days,'capital_incentive_rate',s.capital_incentive_rate,'timezone',s.timezone),
  'code',v_code,'link','/join/zpa/'||v_code,'cycle_month',v_cycle,
  'qualified_investors',(select count(*) from public.zynth_zpa_acquisitions a where a.zpa_id=p_user_id and a.status='qualified' and a.cycle_month=v_cycle),
  'monthly_target',coalesce(v_next,0),'next_milestone',v_next,'next_reward',coalesce(v_next_reward,0),
  'qualified_capital',(select coalesce(sum(first_investment_amount),0) from public.zynth_zpa_acquisitions a where a.zpa_id=p_user_id and a.status='qualified'),
  'available',(select coalesce(sum(greatest(e.amount-e.withdrawn_amount,0)),0) from public.zynth_zpa_earnings e where e.zpa_id=p_user_id and e.status='available' and e.withdrawn_amount<e.amount),
  'qualifying',(select coalesce(sum(amount),0) from public.zynth_zpa_earnings e where e.zpa_id=p_user_id and e.status='qualifying'),
  'pending',(select coalesce(sum(amount),0) from public.zynth_zpa_earnings e where e.zpa_id=p_user_id and e.status='pending'),
  'month_end_withheld',(select coalesce(sum(amount),0) from public.zynth_zpa_earnings e where e.zpa_id=p_user_id and e.status='month_end_withheld'),
  'capital_incentives_earned',(select coalesce(sum(amount),0) from public.zynth_zpa_earnings e where e.zpa_id=p_user_id and e.earning_type='capital_incentive' and e.status<>'failed'),
  'milestone_incentives_earned',(select coalesce(sum(amount),0) from public.zynth_zpa_earnings e where e.zpa_id=p_user_id and e.earning_type='milestone' and e.status<>'reversed'),
  'total_paid',(select coalesce(sum(greatest(e.amount-e.withdrawn_amount,0)),0) from public.zynth_zpa_earnings e where e.zpa_id=p_user_id and e.status='available' and e.withdrawn_amount<e.amount),
  'acquisitions',(select coalesce(jsonb_agg(x order by x.attributed_at desc),'[]'::jsonb) from (select a.id,a.investor_id,a.status,a.first_investment_amount,a.qualifying_started_at,a.qualification_due_at,a.qualified_at,a.failure_reason,a.attributed_at,coalesce(u.full_name,'ZYNTH investor') investor_name from public.zynth_zpa_acquisitions a join public.users u on u.id=a.investor_id where a.zpa_id=p_user_id limit 100)x),
  'earnings',(select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc),'[]'::jsonb) from public.zynth_zpa_earnings e where e.zpa_id=p_user_id limit 100)
 );
end;
$function$;