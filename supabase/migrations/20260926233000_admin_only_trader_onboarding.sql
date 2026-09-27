-- ZYNTH trader governance: administrator-only onboarding
-- Self-application is retired. Existing application records remain as historical data.
revoke execute on function public.zynth_apply_trader(uuid,text,text,text,integer,text[],text,text,text,numeric,numeric,text,text,text) from public, anon, authenticated;
drop function if exists public.zynth_apply_trader(uuid,text,text,text,integer,text[],text,text,text,numeric,numeric,text,text,text);

revoke execute on function public.zynth_admin_review_trader_application(uuid,uuid,text,text) from public, anon, authenticated;
drop function if exists public.zynth_admin_review_trader_application(uuid,uuid,text,text);

comment on table public.zynth_trader_applications is 'Legacy trader application records retained for historical audit only. New trader access is granted exclusively by administrator onboarding.';

revoke insert, update, delete, truncate, references, trigger on table public.zynth_trader_applications from anon, authenticated;
revoke select on table public.zynth_trader_applications from anon;


-- Admin-only trader reporting window updates.
create or replace function public.zynth_admin_update_trader_reporting_window(
 p_admin_id uuid, p_start_time time, p_end_time time
) returns jsonb
language plpgsql security definer
set search_path to 'public','pg_temp'
as $function$
declare v_row public.system_settings%rowtype;
begin
 if auth.uid() is null or auth.uid() <> p_admin_id
    or not exists(select 1 from public.users where id=auth.uid() and role='admin' and account_status='active')
 then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
 if p_start_time = p_end_time then raise exception 'REPORTING_WINDOW_TIMES_CANNOT_MATCH'; end if;
 update public.system_settings
 set trader_report_start_time=p_start_time,trader_report_end_time=p_end_time,updated_at=now()
 where id='00000000-0000-0000-0000-000000000001'
 returning * into v_row;
 if not found then raise exception 'SYSTEM_SETTINGS_NOT_FOUND'; end if;
 insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
 values(auth.uid(),'trader.reporting_window_updated','system_settings',v_row.id,
 jsonb_build_object('start_time',v_row.trader_report_start_time,'end_time',v_row.trader_report_end_time));
 return jsonb_build_object('trader_report_start_time',v_row.trader_report_start_time,'trader_report_end_time',v_row.trader_report_end_time);
end $function$;
revoke execute on function public.zynth_admin_update_trader_reporting_window(uuid,time,time) from public, anon;
grant execute on function public.zynth_admin_update_trader_reporting_window(uuid,time,time) to authenticated;
revoke execute on function public.zynth_admin_get_settings(uuid) from public, anon;
grant execute on function public.zynth_admin_get_settings(uuid) to authenticated;
