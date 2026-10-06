create or replace function public.zynth_kyc_admin_form_upsert(
 p_admin_id uuid,p_id uuid,p_field_key text,p_label text,p_field_type text,p_section text,p_help_text text,
 p_options jsonb,p_required boolean,p_active boolean,p_sort_order integer,p_storage_mode text,p_storage_key text
) returns jsonb language plpgsql security definer set search_path=''
as $function$
declare r public.zynth_kyc_form_fields%rowtype;
begin
 if auth.uid() is null or auth.uid()<>p_admin_id or not public.zynth_has_role(auth.uid(),'admin') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
 if nullif(trim(p_field_key),'') is null or trim(p_field_key) !~ '^[a-z][a-z0-9_]{1,63}$' then raise exception 'INVALID_FIELD_KEY'; end if;
 if nullif(trim(p_label),'') is null then raise exception 'INVALID_FIELD_LABEL'; end if;
 if p_field_type not in ('text','date','select','textarea','country') then raise exception 'INVALID_FIELD_TYPE'; end if;
 if p_storage_mode not in ('core','custom') then raise exception 'INVALID_STORAGE_MODE'; end if;
 if p_storage_mode='core' and trim(coalesce(p_storage_key,'')) not in ('legal_first_name','legal_middle_name','legal_last_name','date_of_birth','nationality','country_of_residence','tax_residency','source_of_funds','source_of_wealth') then raise exception 'INVALID_CORE_STORAGE_KEY'; end if;
 if p_storage_mode='custom' and nullif(trim(p_storage_key),'') is null then p_storage_key:=trim(p_field_key); end if;
 if p_storage_mode='custom' and p_field_key like 'legal_%' then raise exception 'CORE_FIELD_KEY_RESERVED'; end if;
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
end;$function$;
