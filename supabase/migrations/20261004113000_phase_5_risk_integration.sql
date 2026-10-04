-- Phase 5 risk integration layer
-- Wires behavioural risk to server-authoritative lifecycle tables.
alter table public.zynth_risk_events add column if not exists rule_key text;
alter table public.zynth_risk_events add column if not exists dedupe_key text;
drop index if exists public.zynth_risk_events_dedupe_uidx;
create unique index if not exists zynth_risk_events_dedupe_uidx on public.zynth_risk_events(dedupe_key);
create index if not exists zynth_risk_events_rule_idx on public.zynth_risk_events(rule_key,occurred_at desc);

create or replace function public.zynth_risk_classify(p_score integer)
returns text language sql immutable as $$
select case when p_score>=75 then 'CRITICAL' when p_score>=50 then 'HIGH' when p_score>=25 then 'MEDIUM' else 'LOW' end $$;

create or replace function public.zynth_risk_recalculate(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s integer; c text; ev jsonb; a text; case_id uuid;
begin
 if auth.uid() is null and current_user not in ('postgres','service_role') then raise exception 'AUTHORIZATION_REQUIRED'; end if;
 if auth.uid() is not null and auth.uid()<>p_user_id and not public.zynth_has_role(auth.uid(),'admin') then raise exception 'AUTHORIZATION_REQUIRED'; end if;
 select least(100,coalesce(sum(risk_points),0))::int,coalesce(jsonb_agg(jsonb_build_object('rule_key',rule_key,'event_type',event_type,'points',risk_points,'occurred_at',occurred_at) order by occurred_at desc),'[]'::jsonb)
 into s,ev from public.zynth_risk_events where user_id=p_user_id and occurred_at>=now()-interval '30 days' and risk_points>0;
 c:=public.zynth_risk_classify(s);
 a:=case c when 'CRITICAL' then 'FINANCIAL_RESTRICTION' when 'HIGH' then 'WITHDRAWAL_REVIEW' when 'MEDIUM' then 'MONITOR' else 'NONE' end;
 insert into public.zynth_risk_scores(user_id,score,classification,calculated_at,contributing_events,last_high_risk_at,updated_at)
 values(p_user_id,s,c,now(),ev,case when c in ('HIGH','CRITICAL') then now() end,now())
 on conflict(user_id) do update set score=excluded.score,classification=excluded.classification,calculated_at=excluded.calculated_at,contributing_events=excluded.contributing_events,last_high_risk_at=case when excluded.classification in ('HIGH','CRITICAL') then excluded.last_high_risk_at else zynth_risk_scores.last_high_risk_at end,updated_at=now();
 select id into case_id from public.zynth_risk_cases where user_id=p_user_id and status in ('OPEN','IN_REVIEW','MONITORING') order by opened_at desc limit 1;
 if c='LOW' and case_id is not null then update public.zynth_risk_cases set status='RESOLVED',action='NONE',reviewed_at=now(),updated_at=now(),resolution_note='Risk score returned to LOW.' where id=case_id;
 elsif c<>'LOW' and case_id is null then insert into public.zynth_risk_cases(user_id,score,classification,status,action,reason,metadata) values(p_user_id,s,c,'OPEN',a,'Automated behavioural risk assessment',jsonb_build_object('generated_at',now())) returning id into case_id;
 elsif c<>'LOW' then update public.zynth_risk_cases set score=s,classification=c,action=a,updated_at=now() where id=case_id; end if;
 return jsonb_build_object('user_id',p_user_id,'score',s,'classification',c,'action',a,'case_id',case_id);
end $$;

create or replace function public.zynth_risk_record_system_event(p_user_id uuid,p_event_type text,p_source text,p_entity_type text default null,p_entity_id text default null,p_ip_hash text default null,p_device_id uuid default null,p_country_code text default null,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare r record; pts int; key text; meta jsonb:=coalesce(p_metadata,'{}'::jsonb); result jsonb; cnt int;
begin
 if p_user_id is null or not exists(select 1 from public.users where id=p_user_id) then return jsonb_build_object('ok',false,'reason','USER_NOT_FOUND'); end if;
 key:='raw:'||p_event_type||':'||coalesce(p_entity_id,p_user_id::text||':'||clock_timestamp()::text);
 insert into public.zynth_risk_events(user_id,event_type,source,occurred_at,risk_points,entity_type,entity_id,ip_hash,device_id,country_code,metadata,dedupe_key)
 values(p_user_id,p_event_type,p_source,now(),0,p_entity_type,p_entity_id,p_ip_hash,p_device_id,p_country_code,meta,key) on conflict(dedupe_key) do nothing;
 for r in select * from public.zynth_risk_rules where enabled and rule_key in
 (case when p_event_type='NEW_BENEFICIARY' then 'NEW_BENEFICIARY' end,case when p_event_type='FAILED_AUTH' then 'FAILED_AUTH' end,case when p_event_type='UNUSUAL_LOGIN' then 'UNUSUAL_LOGIN' end,case when p_event_type='REFERRAL_QUALIFICATION' then 'IMMEDIATE_REFERRAL' end,case when p_event_type='ZPA_CLUSTER_SIGNAL' then 'ZPA_CLUSTER' end) loop
  select count(*) into cnt from public.zynth_risk_events where user_id=p_user_id and event_type=p_event_type and occurred_at>=now()-make_interval(mins=>r.window_minutes);
  if cnt>=greatest(r.threshold_count,1) then
   key:='rule:'||r.rule_key||':'||coalesce(p_entity_id,p_user_id::text);
   insert into public.zynth_risk_events(user_id,event_type,source,occurred_at,risk_points,rule_key,entity_type,entity_id,ip_hash,device_id,country_code,metadata,dedupe_key)
   values(p_user_id,p_event_type,p_source,now(),least(100,greatest(0,r.points)),r.rule_key,p_entity_type,p_entity_id,p_ip_hash,p_device_id,p_country_code,meta,key) on conflict(dedupe_key) do nothing;
  end if;
 end loop;
 if p_event_type='NEW_DEVICE' and p_device_id is not null and exists(select 1 from public.zynth_security_devices d join public.zynth_security_devices me on me.id=p_device_id where d.user_id<>p_user_id and d.device_key_hash=me.device_key_hash and d.revoked_at is null) then
  select points into pts from public.zynth_risk_rules where rule_key='SHARED_DEVICE' and enabled;
  if pts>0 then insert into public.zynth_risk_events(user_id,event_type,source,occurred_at,risk_points,rule_key,entity_type,entity_id,device_id,metadata,dedupe_key) values(p_user_id,'SHARED_DEVICE_SIGNAL',p_source,now(),pts,'SHARED_DEVICE','device',p_device_id::text,p_device_id,jsonb_build_object('signal_only',false),'rule:SHARED_DEVICE:'||p_device_id::text) on conflict(dedupe_key) do nothing; end if;
 end if;
 if p_ip_hash is not null and p_event_type in ('LOGIN_SUCCESS','NEW_DEVICE','UNUSUAL_LOGIN') and exists(select 1 from public.zynth_security_login_events l where l.user_id<>p_user_id and l.ip_hash=p_ip_hash and l.created_at>=now()-interval '24 hours') then
  select points into pts from public.zynth_risk_rules where rule_key='SHARED_IP' and enabled;
  if pts>0 then insert into public.zynth_risk_events(user_id,event_type,source,occurred_at,risk_points,rule_key,ip_hash,metadata,dedupe_key) values(p_user_id,'SHARED_IP_SIGNAL',p_source,now(),pts,'SHARED_IP',p_ip_hash,jsonb_build_object('signal_only',true),'rule:SHARED_IP:'||p_user_id::text||':'||encode(extensions.digest(p_ip_hash,'sha256'),'hex')) on conflict(dedupe_key) do nothing; end if;
 end if;
 if p_event_type='NEW_BENEFICIARY' and coalesce(meta->>'account_number_hash','')<>'' and exists(select 1 from public.withdrawal_beneficiaries b where b.user_id<>p_user_id and encode(extensions.digest(regexp_replace(b.account_number,'[^0-9]','','g'),'sha256'),'hex')=meta->>'account_number_hash') then
  select points into pts from public.zynth_risk_rules where rule_key='SHARED_BANK' and enabled;
  if pts>0 then insert into public.zynth_risk_events(user_id,event_type,source,occurred_at,risk_points,rule_key,entity_type,entity_id,metadata,dedupe_key) values(p_user_id,'SHARED_BANK_SIGNAL',p_source,now(),pts,'SHARED_BANK','beneficiary',p_entity_id,jsonb_build_object('signal_only',false),'rule:SHARED_BANK:'||coalesce(p_entity_id,p_user_id::text)) on conflict(dedupe_key) do nothing; end if;
 end if;
 if p_event_type in ('WITHDRAWAL_SUBMITTED','WITHDRAWAL_INTENT') and exists(select 1 from public.zynth_risk_events where user_id=p_user_id and event_type='DEPOSIT_CONFIRMED' and occurred_at>=now()-interval '24 hours') then
  select points into pts from public.zynth_risk_rules where rule_key='RAPID_DEPOSIT_WITHDRAWAL' and enabled;
  if pts>0 then insert into public.zynth_risk_events(user_id,event_type,source,occurred_at,risk_points,rule_key,entity_type,entity_id,metadata,dedupe_key) values(p_user_id,'RAPID_DEPOSIT_WITHDRAWAL',p_source,now(),pts,'RAPID_DEPOSIT_WITHDRAWAL',p_entity_type,p_entity_id,jsonb_build_object('window_minutes',1440),'rule:RAPID_DEPOSIT_WITHDRAWAL:'||coalesce(p_entity_id,p_user_id::text)) on conflict(dedupe_key) do nothing; end if;
 end if;
 if p_event_type in ('WITHDRAWAL_SUBMITTED','WITHDRAWAL_INTENT') and exists(select 1 from public.zynth_risk_events where user_id=p_user_id and event_type='NEW_DEVICE' and occurred_at>=now()-interval '24 hours') and exists(select 1 from public.zynth_risk_events where user_id=p_user_id and event_type in ('UNUSUAL_LOGIN','NEW_COUNTRY') and occurred_at>=now()-interval '24 hours') and exists(select 1 from public.zynth_risk_events where user_id=p_user_id and event_type in ('PASSWORD_RESET','PASSWORD_CHANGE') and occurred_at>=now()-interval '24 hours') and exists(select 1 from public.zynth_risk_events where user_id=p_user_id and event_type='NEW_BENEFICIARY' and occurred_at>=now()-interval '24 hours') then
  select points into pts from public.zynth_risk_rules where rule_key='ATO_CHAIN' and enabled;
  if pts>0 then insert into public.zynth_risk_events(user_id,event_type,source,occurred_at,risk_points,rule_key,entity_type,entity_id,metadata,dedupe_key) values(p_user_id,'ATO_CHAIN_SIGNAL',p_source,now(),pts,'ATO_CHAIN',p_entity_type,p_entity_id,jsonb_build_object('independent_signals',4),'rule:ATO_CHAIN:'||coalesce(p_entity_id,p_user_id::text)) on conflict(dedupe_key) do nothing; end if;
 end if;
 select public.zynth_risk_recalculate(p_user_id) into result;
 return jsonb_build_object('ok',true,'risk',result);
end $$;

create or replace function public.zynth_risk_trigger() returns trigger language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare u uuid; ev text; ent text; meta jsonb:='{}'::jsonb;
begin
 if TG_TABLE_NAME='deposit_requests' then u:=coalesce(NEW.user_id,OLD.user_id); ent:=coalesce(NEW.id,OLD.id)::text; if TG_OP='INSERT' then ev:='DEPOSIT_REQUESTED'; elsif TG_OP='UPDATE' and NEW.status='confirmed' and OLD.status is distinct from NEW.status then ev:='DEPOSIT_CONFIRMED'; elsif TG_OP='UPDATE' and NEW.status in ('rejected','cancelled') and OLD.status is distinct from NEW.status then ev:='DEPOSIT_FAILED'; end if;
 elsif TG_TABLE_NAME='zynth_investments' and TG_OP='INSERT' then u:=NEW.user_id;ent:=NEW.id::text;ev:='INVESTMENT_CREATED';meta:=jsonb_build_object('amount',NEW.principal,'strategy_id',NEW.strategy_id);
 elsif TG_TABLE_NAME='withdrawal_requests' and TG_OP='INSERT' then u:=NEW.user_id;ent:=NEW.id::text;ev:='WITHDRAWAL_SUBMITTED';meta:=jsonb_build_object('amount',NEW.gross_amount,'source',NEW.withdrawal_source,'beneficiary_id',NEW.beneficiary_id);
 elsif TG_TABLE_NAME='zynth_redemption_requests' and TG_OP='INSERT' then u:=NEW.user_id;ent:=NEW.id::text;ev:='REDEMPTION_REQUESTED';meta:=jsonb_build_object('amount',NEW.gross_amount,'investment_id',NEW.investment_id);
 elsif TG_TABLE_NAME='zynth_referral_rewards' and TG_OP='INSERT' then u:=NEW.referred_user_id;ent:=NEW.id::text;ev:=case when coalesce(NEW.trigger_event,'') ilike '%qual%' then 'REFERRAL_QUALIFICATION' else 'REFERRAL_REWARD' end;meta:=jsonb_build_object('referrer_id',NEW.referrer_id,'reward_amount',NEW.reward_amount);
 elsif TG_TABLE_NAME='zynth_zpa_acquisitions' then u:=coalesce(NEW.investor_id,OLD.investor_id);ent:=coalesce(NEW.id,OLD.id)::text;if TG_OP='INSERT' then ev:='ZPA_ATTRIBUTION';elsif TG_OP='UPDATE' and NEW.status='qualifying' and OLD.status is distinct from NEW.status then ev:='ZPA_FIRST_INVESTMENT';elsif TG_OP='UPDATE' and NEW.status='qualified' and OLD.status is distinct from NEW.status then ev:='ZPA_QUALIFIED';end if;
 elsif TG_TABLE_NAME='zynth_zpa_earnings' and TG_OP='INSERT' then u:=NEW.investor_id;ent:=NEW.id::text;ev:='ZPA_REWARD';meta:=jsonb_build_object('zpa_id',NEW.zpa_id,'amount',NEW.amount,'earning_type',NEW.earning_type);
 elsif TG_TABLE_NAME='zynth_security_devices' and TG_OP='INSERT' then u:=NEW.user_id;ent:=NEW.id::text;ev:='NEW_DEVICE';meta:=jsonb_build_object('device_name',NEW.device_name,'device_type',NEW.device_type);
 elsif TG_TABLE_NAME='zynth_security_login_events' and TG_OP='INSERT' then u:=NEW.user_id;ent:=NEW.id::text;ev:=case when NEW.success and NEW.event_type='login_success' then 'LOGIN_SUCCESS' when not NEW.success then 'FAILED_AUTH' when NEW.event_type='suspicious_login' then 'UNUSUAL_LOGIN' when NEW.event_type='password_change' then 'PASSWORD_CHANGE' else null end;meta:=jsonb_build_object('risk_score',NEW.risk_score,'failure_reason',NEW.failure_reason);
 elsif TG_TABLE_NAME='withdrawal_beneficiaries' and TG_OP='INSERT' then u:=NEW.user_id;ent:=NEW.id::text;ev:='NEW_BENEFICIARY';meta:=jsonb_build_object('account_number_hash',encode(extensions.digest(regexp_replace(NEW.account_number,'[^0-9]','','g'),'sha256'),'hex'));
 end if;
 if u is not null and ev is not null then perform public.zynth_risk_record_system_event(u,ev,'db_trigger',TG_TABLE_NAME,ent,null,null,null,meta); end if;
 return coalesce(NEW,OLD);
end $$;

drop trigger if exists trg_risk_deposit_requests on public.deposit_requests;
create trigger trg_risk_deposit_requests after insert or update of status on public.deposit_requests for each row execute function public.zynth_risk_trigger();
drop trigger if exists trg_risk_investments on public.zynth_investments;
create trigger trg_risk_investments after insert on public.zynth_investments for each row execute function public.zynth_risk_trigger();
drop trigger if exists trg_risk_withdrawals on public.withdrawal_requests;
create trigger trg_risk_withdrawals after insert on public.withdrawal_requests for each row execute function public.zynth_risk_trigger();
drop trigger if exists trg_risk_redemptions on public.zynth_redemption_requests;
create trigger trg_risk_redemptions after insert on public.zynth_redemption_requests for each row execute function public.zynth_risk_trigger();
drop trigger if exists trg_risk_referral_rewards on public.zynth_referral_rewards;
create trigger trg_risk_referral_rewards after insert on public.zynth_referral_rewards for each row execute function public.zynth_risk_trigger();
drop trigger if exists trg_risk_zpa_acq on public.zynth_zpa_acquisitions;
create trigger trg_risk_zpa_acq after insert or update of status on public.zynth_zpa_acquisitions for each row execute function public.zynth_risk_trigger();
drop trigger if exists trg_risk_zpa_earnings on public.zynth_zpa_earnings;
create trigger trg_risk_zpa_earnings after insert on public.zynth_zpa_earnings for each row execute function public.zynth_risk_trigger();
drop trigger if exists trg_risk_devices on public.zynth_security_devices;
create trigger trg_risk_devices after insert on public.zynth_security_devices for each row execute function public.zynth_risk_trigger();
drop trigger if exists trg_risk_logins on public.zynth_security_login_events;
create trigger trg_risk_logins after insert on public.zynth_security_login_events for each row execute function public.zynth_risk_trigger();
drop trigger if exists trg_risk_beneficiaries on public.withdrawal_beneficiaries;
create trigger trg_risk_beneficiaries after insert on public.withdrawal_beneficiaries for each row execute function public.zynth_risk_trigger();

create or replace function public.zynth_risk_admin_rules(p_admin_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin if auth.uid() is null or auth.uid()<>p_admin_id or not public.zynth_has_role(auth.uid(),'admin') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if; return coalesce((select jsonb_agg(to_jsonb(r) order by r.rule_key) from public.zynth_risk_rules r),'[]'::jsonb); end $$;
create or replace function public.zynth_risk_admin_update_rule(p_admin_id uuid,p_rule_key text,p_enabled boolean,p_points integer,p_threshold_count integer,p_window_minutes integer,p_action text,p_config jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.zynth_risk_rules%rowtype;
begin
 if auth.uid() is null or auth.uid()<>p_admin_id or not public.zynth_has_role(auth.uid(),'admin') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
 if p_points<0 or p_points>100 or p_threshold_count<1 or p_threshold_count>1000 or p_window_minutes<1 or p_window_minutes>43200 then raise exception 'INVALID_RISK_RULE_CONFIGURATION'; end if;
 if p_action not in ('FLAG','MONITOR','WITHDRAWAL_REVIEW','FINANCIAL_RESTRICTION') then raise exception 'INVALID_RISK_ACTION'; end if;
 update public.zynth_risk_rules set enabled=p_enabled,points=p_points,threshold_count=p_threshold_count,window_minutes=p_window_minutes,action=p_action,config=coalesce(p_config,'{}'::jsonb),updated_at=now() where rule_key=p_rule_key returning * into r;
 if not found then raise exception 'RISK_RULE_NOT_FOUND'; end if;
 insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values(auth.uid(),'risk.rule_updated','risk_rule',r.rule_key,jsonb_build_object('enabled',r.enabled,'points',r.points,'threshold_count',r.threshold_count,'window_minutes',r.window_minutes,'action',r.action));
 return to_jsonb(r);
end $$;
revoke all on function public.zynth_risk_admin_rules(uuid),public.zynth_risk_admin_update_rule(uuid,text,boolean,integer,integer,integer,text,jsonb) from anon,public;
grant execute on function public.zynth_risk_admin_rules(uuid),public.zynth_risk_admin_update_rule(uuid,text,boolean,integer,integer,integer,text,jsonb) to authenticated,service_role;
