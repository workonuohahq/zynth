-- Align broadcast audience resolution with the canonical ZYNTH multi-role model.
-- Investors and traders are independent active role assignments.
-- Specific-user targeting remains exact-ID and role-agnostic.
-- Push delivery logic is intentionally unchanged.

create or replace function public.zynth_broadcast_candidates(p_audience jsonb)
returns table(user_id uuid, full_name text, email text, role text, account_status text, kyc_verified boolean, funded boolean, push_state text)
language sql stable security definer set search_path to ''
as $function$
  with role_map as (
    select
      ur.user_id,
      bool_or(r.key='investor') filter (where r.key='investor') as is_investor,
      bool_or(r.key='trader') filter (where r.key='trader') as is_trader,
      bool_or(r.key='admin') filter (where r.key='admin') as is_admin,
      bool_or(r.key='zpa') filter (where r.key='zpa') as is_zpa,
      string_agg(r.name, ', ' order by r.sort_order, r.name) as role_label
    from public.zynth_user_roles ur
    join public.zynth_roles r on r.id=ur.role_id
    where ur.is_active and r.is_active and (ur.expires_at is null or ur.expires_at>now())
    group by ur.user_id
  ),
  candidates as (
    select
      u.id,
      u.full_name,
      u.email,
      coalesce(rm.role_label,'') as role,
      u.account_status,
      coalesce(u.kyc_verified,false) as kyc_verified,
      (
        exists(select 1 from public.deposit_requests d where d.user_id=u.id and d.status='confirmed')
        or exists(select 1 from public.zynth_investments i where i.user_id=u.id)
      ) as funded,
      coalesce(rm.is_investor,false) as is_investor,
      coalesce(rm.is_trader,false) as is_trader,
      coalesce(rm.is_admin,false) as is_admin,
      coalesce(rm.is_zpa,false) as is_zpa,
      exists(select 1 from public.zynth_push_subscriptions ps where ps.user_id=u.id and ps.revoked_at is null) as has_device,
      coalesce(np.push_enabled,true) as push_enabled
    from public.users u
    left join role_map rm on rm.user_id=u.id
    left join public.zynth_notification_preferences np on np.user_id=u.id
    where coalesce(u.account_status,'active')='active'
  )
  select
    c.id,c.full_name,c.email,c.role,c.account_status,c.kyc_verified,c.funded,
    case when c.push_enabled=false then 'disabled'
         when c.has_device then 'enabled'
         else 'no_device' end
  from candidates c
  where
    (
      coalesce(p_audience->>'role','all')='all'
      or (p_audience->>'role')='investors' and c.is_investor
      or (p_audience->>'role')='traders' and c.is_trader
      or (p_audience->>'role')='users_except_traders' and c.is_investor and not c.is_trader
      or (p_audience->>'role')='admins' and (c.is_admin or c.is_zpa)
      or (p_audience->>'role')='specific' and c.id::text in (select jsonb_array_elements_text(coalesce(p_audience->'user_ids','[]'::jsonb)))
    )
    and (
      coalesce(p_audience->>'funding','any')='any'
      or (p_audience->>'funding')='funded' and c.funded
      or (p_audience->>'funding')='unfunded' and not c.funded
    )
    and (
      coalesce(p_audience->>'push_status','any')='any'
      or (p_audience->>'push_status')=case when c.push_enabled=false then 'disabled' when c.has_device then 'enabled' else 'no_device' end
      or (p_audience->>'push_status')='disabled_or_no_device' and (not c.push_enabled or not c.has_device)
    )
    and (
      coalesce(p_audience->>'account_status','active')='any'
      or coalesce(p_audience->>'account_status','active')=c.account_status
      or (p_audience->>'account_status')='verified' and c.kyc_verified
      or (p_audience->>'account_status')='unverified' and not c.kyc_verified
    )
$function$;

create or replace function public.zynth_admin_broadcast_preview(p_admin_id uuid,p_audience jsonb)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare total_count integer;investors_count integer;traders_count integer;funded_count integer;unfunded_count integer;push_enabled_count integer;push_disabled_count integer;push_no_device_count integer;
begin
 if not public.zynth_has_role(auth.uid(),'admin') or not exists(select 1 from public.users where id=auth.uid() and account_status='active') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
 select count(*),
   count(*) filter(where c.role ilike '%investor%'),
   count(*) filter(where c.role ilike '%trader%'),
   count(*) filter(where c.funded),
   count(*) filter(where not c.funded),
   count(*) filter(where c.push_state='enabled'),
   count(*) filter(where c.push_state='disabled'),
   count(*) filter(where c.push_state='no_device')
 into total_count,investors_count,traders_count,funded_count,unfunded_count,push_enabled_count,push_disabled_count,push_no_device_count
 from public.zynth_broadcast_candidates(coalesce(p_audience,'{}'::jsonb)) c;
 return jsonb_build_object('recipient_count',total_count,'investors',investors_count,'traders',traders_count,'funded',funded_count,'unfunded',unfunded_count,'push_enabled',push_enabled_count,'push_disabled',push_disabled_count,'push_no_device',push_no_device_count);
end
$function$;

-- The exact-user picker uses the same canonical active-account resolver as broadcasts.
create or replace function public.zynth_admin_broadcast_user_directory(p_admin_id uuid,p_query text)
returns table(user_id uuid, full_name text, email text, role text, funded boolean, push_state text)
language plpgsql security definer set search_path to ''
as $function$
begin
 if not public.zynth_has_role(auth.uid(),'admin') or not exists(select 1 from public.users where id=auth.uid() and account_status='active') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
 return query
 select c.user_id,c.full_name,c.email,c.role,c.funded,c.push_state
 from public.zynth_broadcast_candidates('{"role":"all","funding":"any","push_status":"any","account_status":"active"}'::jsonb) c
 where coalesce(p_query,'')='' or coalesce(c.full_name,'') ilike '%'||p_query||'%' or coalesce(c.email,'') ilike '%'||p_query||'%'
 order by c.full_name nulls last,c.email
 limit 50;
end
$function$;
