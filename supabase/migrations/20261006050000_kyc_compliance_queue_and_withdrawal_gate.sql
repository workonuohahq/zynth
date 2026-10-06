-- Authoritative KYC compliance queue with lifecycle counts.
-- Applied to production on 2026-10-06.
create or replace function public.zynth_kyc_admin_queue(
  p_admin_id uuid,p_search text default null,p_queue text default 'ALL',p_risk text default 'ALL',
  p_limit integer default 50,p_offset integer default 0
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare out jsonb;
begin
 if auth.uid() is null or auth.uid()<>p_admin_id or not public.zynth_has_role(auth.uid(),'admin') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
 with base as (
  select u.id user_id,u.email,u.full_name,u.account_status,p.status profile_status,p.verification_level,
   coalesce(p.risk_classification,'LOW') risk_classification,p.verified_at,p.expires_at,p.next_review_due_at,p.updated_at,
   case when p.user_id is null then 'NOT_STARTED' when p.status='VERIFIED' and p.expires_at is not null and p.expires_at<=now() then 'EXPIRED' else p.status end effective_status
  from public.users u left join public.zynth_kyc_profiles p on p.user_id=u.id
  where coalesce(u.role::text,'user')<>'admin'
   and (p_search is null or trim(p_search)='' or u.email ilike '%'||trim(p_search)||'%' or u.full_name ilike '%'||trim(p_search)||'%' or u.id::text ilike '%'||trim(p_search)||'%')
   and (upper(coalesce(p_risk,'ALL'))='ALL' or coalesce(p.risk_classification,'LOW')=upper(p_risk))
 ), filtered as (
  select * from base where upper(coalesce(p_queue,'ALL'))='ALL' or effective_status=upper(p_queue)
 ), counts as (
  select jsonb_build_object('ALL',(select count(*) from base),'NOT_STARTED',(select count(*) from base where effective_status='NOT_STARTED'),'PENDING',(select count(*) from base where effective_status='PENDING'),'IN_REVIEW',(select count(*) from base where effective_status='IN_REVIEW'),'COMPLETED',(select count(*) from base where effective_status='VERIFIED'),'EXPIRED',(select count(*) from base where effective_status='EXPIRED'),'REVERIFICATION_REQUIRED',(select count(*) from base where effective_status='REVERIFICATION_REQUIRED'),'REJECTED',(select count(*) from base where effective_status='REJECTED'),'SUSPENDED',(select count(*) from base where effective_status='SUSPENDED')) value
 ), page as (
  select * from filtered order by case risk_classification when 'CRITICAL' then 0 when 'HIGH' then 1 when 'MEDIUM' then 2 else 3 end,case effective_status when 'IN_REVIEW' then 0 when 'PENDING' then 1 when 'REVERIFICATION_REQUIRED' then 2 when 'EXPIRED' then 3 else 4 end,coalesce(updated_at,timestamp with time zone 'epoch') desc
  limit greatest(1,least(coalesce(p_limit,50),100)) offset greatest(coalesce(p_offset,0),0)
 )
 select jsonb_build_object('queue',upper(coalesce(p_queue,'ALL')),'total',(select count(*) from filtered),'counts',(select value from counts),'items',coalesce((select jsonb_agg(to_jsonb(page) order by page.effective_status,page.updated_at desc) from page),'[]'::jsonb)) into out;
 return out;
end;
$function$;
revoke all on function public.zynth_kyc_admin_queue(uuid,text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.zynth_kyc_admin_queue(uuid,text,text,text,integer,integer) to authenticated,service_role;