-- Keep admin ZPA directory aligned with the public partner identity and remove the unused controlled-attribution candidate payload.
CREATE OR REPLACE FUNCTION public.zynth_admin_zpa_dashboard(p_admin_id uuid)
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
  'zpas',(select coalesce(jsonb_agg(x order by x.qualified_count desc,x.full_name),'[]'::jsonb) from (
    select u.id,u.full_name,u.email,u.account_status,
      (select c.code from public.zynth_zpa_codes c where c.zpa_id=u.id and c.active=true limit 1) zpa_code,
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
  )x)
 );
end;
$function$;