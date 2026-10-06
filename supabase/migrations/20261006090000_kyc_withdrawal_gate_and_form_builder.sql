-- KYC withdrawal gate and configurable form fields
alter table public.zynth_kyc_profiles add column if not exists custom_data jsonb not null default '{}'::jsonb;
create table if not exists public.zynth_kyc_form_fields (
 id uuid primary key default gen_random_uuid(), field_key text not null unique, label text not null,
 field_type text not null default 'text' check(field_type in ('text','date','select','textarea','country')),
 section text not null default 'Identity', help_text text, options jsonb not null default '[]'::jsonb,
 required boolean not null default false, active boolean not null default true, sort_order integer not null default 0,
 storage_mode text not null default 'custom' check(storage_mode in ('core','custom')), storage_key text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.zynth_kyc_form_fields enable row level security;
revoke all on public.zynth_kyc_form_fields from anon,authenticated;
insert into public.zynth_kyc_form_fields(field_key,label,field_type,section,help_text,required,active,sort_order,storage_mode,storage_key) values
('legal_first_name','Legal first name','text','Identity','Exactly as shown on your identity document.',true,true,10,'core','legal_first_name'),
('legal_middle_name','Middle name','text','Identity','Optional if none is shown.',false,true,20,'core','legal_middle_name'),
('legal_last_name','Legal last name','text','Identity','Exactly as shown on your identity document.',true,true,30,'core','legal_last_name'),
('date_of_birth','Date of birth','date','Identity','Your legal date of birth.',true,true,40,'core','date_of_birth'),
('nationality','Nationality','country','Identity','Your nationality.',true,true,50,'core','nationality'),
('country_of_residence','Country of residence','country','Residence','Where you currently reside.',true,true,60,'core','country_of_residence'),
('tax_residency','Tax residency','country','Financial profile','Country where you are tax resident.',true,true,70,'core','tax_residency'),
('source_of_funds','Source of funds','textarea','Financial profile','Explain where the funds you intend to use come from.',true,true,80,'core','source_of_funds'),
('source_of_wealth','Source of wealth','textarea','Financial profile','Explain the underlying source of your wealth.',true,true,90,'core','source_of_wealth')
on conflict(field_key) do nothing;

create or replace function public.zynth_kyc_is_complete(p_user_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.zynth_kyc_profiles p where p.user_id=p_user_id and p.status='VERIFIED' and (p.expires_at is null or p.expires_at>now()));
$$;
create or replace function public.zynth_kyc_completion_status() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('complete',public.zynth_kyc_is_complete(auth.uid()),'status',coalesce((select p.status from public.zynth_kyc_profiles p where p.user_id=auth.uid()),'NOT_STARTED'),'expires_at',(select p.expires_at from public.zynth_kyc_profiles p where p.user_id=auth.uid()),'verification_level',coalesce((select p.verification_level from public.zynth_kyc_profiles p where p.user_id=auth.uid()),'NONE'));
$$;
create or replace function public.zynth_kyc_form_config() returns jsonb language plpgsql security definer set search_path='' as $$
declare fields jsonb; result jsonb;
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
 insert into public.zynth_kyc_profiles(user_id) values(auth.uid()) on conflict do nothing;
 select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'field_key',f.field_key,'label',f.label,'field_type',f.field_type,'section',f.section,'help_text',f.help_text,'options',f.options,'required',f.required,'active',f.active,'sort_order',f.sort_order,'storage_mode',f.storage_mode,'storage_key',f.storage_key) order by f.sort_order,f.created_at),'[]'::jsonb) into fields from public.zynth_kyc_form_fields f where f.active;
 select jsonb_build_object('profile',to_jsonb(p),'fields',fields) into result from public.zynth_kyc_profiles p where p.user_id=auth.uid();
 return result;
end;$$;
create or replace function public.zynth_kyc_save_custom_data(p_custom_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); cleaned jsonb:='{}'::jsonb; k text; v jsonb;
begin
 if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
 if p_custom_data is null or jsonb_typeof(p_custom_data)<>'object' then raise exception 'INVALID_KYC_CUSTOM_DATA'; end if;
 for k,v in select key,value from jsonb_each(p_custom_data) loop
  if exists(select 1 from public.zynth_kyc_form_fields f where f.field_key=k and f.active and f.storage_mode='custom') then cleaned:=cleaned||jsonb_build_object(k,v); end if;
 end loop;
 update public.zynth_kyc_profiles set custom_data=coalesce(custom_data,'{}'::jsonb)||cleaned,updated_at=now() where user_id=uid;
 return jsonb_build_object('ok',true,'custom_data',(select custom_data from public.zynth_kyc_profiles where user_id=uid));
end;$$;
create or replace function public.zynth_kyc_admin_form_fields(p_admin_id uuid) returns jsonb language sql security definer set search_path='' as $$
 select case when auth.uid()=p_admin_id and public.zynth_has_role(auth.uid(),'admin') then coalesce(jsonb_agg(to_jsonb(f) order by f.sort_order,f.created_at),'[]'::jsonb) else '[]'::jsonb end from public.zynth_kyc_form_fields f;
$$;
create or replace function public.zynth_kyc_admin_form_upsert(p_admin_id uuid,p_id uuid,p_field_key text,p_label text,p_field_type text,p_section text,p_help_text text,p_options jsonb,p_required boolean,p_active boolean,p_sort_order integer,p_storage_mode text,p_storage_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.zynth_kyc_form_fields%rowtype;
begin
 if auth.uid() is null or auth.uid()<>p_admin_id or not public.zynth_has_role(auth.uid(),'admin') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
 if nullif(trim(p_field_key),'') is null or trim(p_field_key)!~'^[a-z][a-z0-9_]{1,63}$' then raise exception 'INVALID_FIELD_KEY'; end if;
 if nullif(trim(p_label),'') is null then raise exception 'INVALID_FIELD_LABEL'; end if;
 if p_field_type not in('text','date','select','textarea','country') then raise exception 'INVALID_FIELD_TYPE'; end if;
 if p_storage_mode not in('core','custom') then raise exception 'INVALID_STORAGE_MODE'; end if;
 if p_storage_mode='core' and nullif(trim(p_storage_key),'') is null then raise exception 'CORE_STORAGE_KEY_REQUIRED'; end if;
 if p_id is null then
  insert into public.zynth_kyc_form_fields(field_key,label,field_type,section,help_text,options,required,active,sort_order,storage_mode,storage_key)
  values(trim(p_field_key),trim(p_label),p_field_type,coalesce(nullif(trim(p_section),''),'General'),nullif(trim(p_help_text),''),coalesce(p_options,'[]'::jsonb),coalesce(p_required,false),coalesce(p_active,true),coalesce(p_sort_order,100),p_storage_mode,nullif(trim(p_storage_key),''))
  returning * into r;
  insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values(auth.uid(),'kyc.form_field_added','kyc_form_field',r.id,jsonb_build_object('field_key',r.field_key));
 else
  update public.zynth_kyc_form_fields set field_key=trim(p_field_key),label=trim(p_label),field_type=p_field_type,section=coalesce(nullif(trim(p_section),''),'General'),help_text=nullif(trim(p_help_text),''),options=coalesce(p_options,'[]'::jsonb),required=coalesce(p_required,false),active=coalesce(p_active,true),sort_order=coalesce(p_sort_order,100),storage_mode=p_storage_mode,storage_key=nullif(trim(p_storage_key),''),updated_at=now() where id=p_id returning * into r;
  if not found then raise exception 'KYC_FORM_FIELD_NOT_FOUND'; end if;
  insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values(auth.uid(),'kyc.form_field_updated','kyc_form_field',r.id,jsonb_build_object('field_key',r.field_key));
 end if;
 return jsonb_build_object('ok',true,'field',to_jsonb(r));
end;$$;
create or replace function public.zynth_kyc_admin_form_remove(p_admin_id uuid,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.zynth_kyc_form_fields%rowtype;
begin
 if auth.uid() is null or auth.uid()<>p_admin_id or not public.zynth_has_role(auth.uid(),'admin') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
 update public.zynth_kyc_form_fields set active=false,updated_at=now() where id=p_id returning * into r;
 if not found then raise exception 'KYC_FORM_FIELD_NOT_FOUND'; end if;
 insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values(auth.uid(),'kyc.form_field_removed','kyc_form_field',r.id,jsonb_build_object('field_key',r.field_key));
 return jsonb_build_object('ok',true,'field_id',r.id,'active',false);
end;$$;

revoke all on function public.zynth_kyc_is_complete(uuid) from public,anon; grant execute on function public.zynth_kyc_is_complete(uuid) to authenticated,service_role;
revoke all on function public.zynth_kyc_completion_status() from public,anon; grant execute on function public.zynth_kyc_completion_status() to authenticated,service_role;
revoke all on function public.zynth_kyc_form_config() from public,anon; grant execute on function public.zynth_kyc_form_config() to authenticated,service_role;
revoke all on function public.zynth_kyc_save_custom_data(jsonb) from public,anon; grant execute on function public.zynth_kyc_save_custom_data(jsonb) to authenticated,service_role;
revoke all on function public.zynth_kyc_admin_form_fields(uuid) from public,anon,authenticated; grant execute on function public.zynth_kyc_admin_form_fields(uuid) to service_role;
revoke all on function public.zynth_kyc_admin_form_upsert(uuid,uuid,text,text,text,text,text,jsonb,boolean,boolean,integer,text,text) from public,anon,authenticated; grant execute on function public.zynth_kyc_admin_form_upsert(uuid,uuid,text,text,text,text,text,jsonb,boolean,boolean,integer,text,text) to service_role;
revoke all on function public.zynth_kyc_admin_form_remove(uuid,uuid) from public,anon,authenticated; grant execute on function public.zynth_kyc_admin_form_remove(uuid,uuid) to service_role;

create or replace function public.request_withdrawal_by_source(p_user_id uuid,p_amount numeric,p_beneficiary_id uuid,p_source text,p_pin text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_risk public.zynth_risk_scores%rowtype; v_result jsonb; v_intent jsonb;
begin
 if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'AUTHORIZATION_REQUIRED'; end if;
 if not public.zynth_kyc_is_complete(p_user_id) then raise exception 'KYC_REQUIRED'; end if;
 perform public.zynth_withdrawal_pin_check(p_pin);
 if not exists(select 1 from public.withdrawal_beneficiaries where id=p_beneficiary_id and user_id=p_user_id) then raise exception 'BENEFICIARY_NOT_FOUND'; end if;
 if exists(select 1 from public.withdrawal_beneficiaries where id=p_beneficiary_id and user_id=p_user_id and security_locked_until is not null and security_locked_until>now()) then raise exception 'BENEFICIARY_COOLING_DOWN'; end if;
 v_intent:=public.zynth_risk_record_system_event(p_user_id,'WITHDRAWAL_INTENT','withdrawal_security','beneficiary',p_beneficiary_id::text,null,null,null,jsonb_build_object('amount',p_amount,'source',p_source));
 select * into v_risk from public.zynth_risk_scores where user_id=p_user_id;
 if coalesce(v_risk.classification,'LOW')='CRITICAL' then insert into public.zynth_withdrawal_security_events(user_id,event_type,risk_score,metadata) values(p_user_id,'withdrawal_blocked_pin',coalesce(v_risk.score,0),jsonb_build_object('reason','CRITICAL_RISK_RESTRICTION')); raise exception 'WITHDRAWAL_RISK_REVIEW_REQUIRED'; end if;
 v_result:=public.request_withdrawal_by_source(p_user_id,p_amount,p_beneficiary_id,p_source);
 if coalesce(v_risk.classification,'LOW')='HIGH' and coalesce((v_result->>'withdrawal_id'),'')<>'' then update public.withdrawal_requests set status='under_review',metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('risk_review_required',true,'risk_score',v_risk.score,'risk_classification',v_risk.classification) where id=(v_result->>'withdrawal_id')::uuid; v_result:=v_result||jsonb_build_object('status','under_review','risk_review_required',true); end if;
 return v_result;
end;$$;
revoke execute on function public.request_withdrawal_by_source(uuid,numeric,uuid,text) from public,anon,authenticated;
revoke execute on function public.request_withdrawal(uuid,numeric,uuid) from public,anon,authenticated;
revoke execute on function public.request_profit_withdrawal(uuid,numeric,uuid) from public,anon,authenticated;
revoke execute on function public.request_withdrawal_by_source(uuid,numeric,uuid,text,text) from public,anon;
grant execute on function public.request_withdrawal_by_source(uuid,numeric,uuid,text,text) to authenticated,service_role;
-- Admin RPCs are callable through authenticated sessions but self-authorize by auth.uid() + admin role.
grant execute on function public.zynth_kyc_admin_form_fields(uuid) to authenticated;
grant execute on function public.zynth_kyc_admin_form_upsert(uuid,uuid,text,text,text,text,text,jsonb,boolean,boolean,integer,text,text) to authenticated;
grant execute on function public.zynth_kyc_admin_form_remove(uuid,uuid) to authenticated;
