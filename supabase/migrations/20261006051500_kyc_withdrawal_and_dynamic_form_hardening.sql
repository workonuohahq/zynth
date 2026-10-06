-- KYC withdrawal gate and dynamic form submission hardening.
alter function public.request_profit_withdrawal(uuid,numeric,uuid) rename to request_profit_withdrawal_unchecked;
create or replace function public.request_profit_withdrawal(p_user_id uuid,p_amount numeric,p_beneficiary_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $function$
begin
 if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'AUTHORIZATION_REQUIRED'; end if;
 if not public.zynth_kyc_is_complete(p_user_id) then raise exception 'KYC_REQUIRED'; end if;
 return public.request_profit_withdrawal_unchecked(p_user_id,p_amount,p_beneficiary_id);
end;
$function$;
revoke all on function public.request_profit_withdrawal_unchecked(uuid,numeric,uuid) from public,anon,authenticated;
grant execute on function public.request_profit_withdrawal_unchecked(uuid,numeric,uuid) to service_role;
revoke all on function public.request_profit_withdrawal(uuid,numeric,uuid) from public,anon;
grant execute on function public.request_profit_withdrawal(uuid,numeric,uuid) to authenticated,service_role;
revoke all on function public.request_withdrawal_by_source(uuid,numeric,uuid,text) from public,anon,authenticated;

create or replace function public.zynth_kyc_submit_form(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare uid uuid:=auth.uid();oldp public.zynth_kyc_profiles%rowtype;newp public.zynth_kyc_profiles%rowtype;f record;value text;custom jsonb:=coalesce(p_payload->'custom','{}'::jsonb);
begin
 if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
 insert into public.zynth_kyc_profiles(user_id) values(uid) on conflict do nothing;
 select * into oldp from public.zynth_kyc_profiles where user_id=uid for update;
 if oldp.status='SUSPENDED' then raise exception 'KYC_SUSPENDED'; end if;
 for f in select field_key,required,storage_mode,storage_key,label from public.zynth_kyc_form_fields where active=true and required=true order by sort_order,created_at loop
  if f.storage_mode='core' then value:=nullif(trim(coalesce(p_payload->>coalesce(f.storage_key,f.field_key),'')),''); else value:=nullif(trim(coalesce(custom->>coalesce(f.storage_key,f.field_key),'')),''); end if;
  if value is null then raise exception 'KYC_REQUIRED_FIELD:%',f.label; end if;
 end loop;
 update public.zynth_kyc_profiles set legal_first_name=coalesce(nullif(trim(p_payload->>'legal_first_name'),''),legal_first_name),legal_middle_name=coalesce(nullif(trim(p_payload->>'legal_middle_name'),''),legal_middle_name),legal_last_name=coalesce(nullif(trim(p_payload->>'legal_last_name'),''),legal_last_name),date_of_birth=coalesce(nullif(p_payload->>'date_of_birth','')::date,date_of_birth),nationality=coalesce(nullif(trim(p_payload->>'nationality'),''),nationality),country_of_residence=coalesce(nullif(trim(p_payload->>'country_of_residence'),''),country_of_residence),tax_residency=coalesce(nullif(trim(p_payload->>'tax_residency'),''),tax_residency),source_of_funds=coalesce(nullif(trim(p_payload->>'source_of_funds'),''),source_of_funds),source_of_funds_status=case when nullif(trim(p_payload->>'source_of_funds'),'') is not null then 'PENDING' else source_of_funds_status end,source_of_wealth=coalesce(nullif(trim(p_payload->>'source_of_wealth'),''),source_of_wealth),source_of_wealth_status=case when nullif(trim(p_payload->>'source_of_wealth'),'') is not null then 'PENDING' else source_of_wealth_status end,custom_data=coalesce(custom_data,'{}'::jsonb)||custom,status=case when status in ('NOT_STARTED','REJECTED','REVERIFICATION_REQUIRED') then 'PENDING' else status end,updated_at=now() where user_id=uid returning * into newp;
 insert into public.zynth_kyc_review_history(user_id,action,from_status,to_status,notes) values(uid,'SUBMITTED',oldp.status,newp.status,'KYC form submitted');
 return jsonb_build_object('ok',true,'status',newp.status);
end;
$function$;
revoke all on function public.zynth_kyc_submit_form(jsonb) from public,anon;
grant execute on function public.zynth_kyc_submit_form(jsonb) to authenticated,service_role;