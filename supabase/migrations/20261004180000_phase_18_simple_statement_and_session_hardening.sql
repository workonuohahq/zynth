-- Phase 18: remove unnecessary service-role dependency from investor statements
-- Statement generation and PDF retrieval now use authenticated, auth.uid()-bound RPCs.
create or replace function public.zynth_statement_insert_base64(
 p_user_id uuid,p_period_type text,p_period_start date,p_period_end date,p_snapshot jsonb,p_pdf_base64 text,p_content_hash text,p_supersedes_id uuid default null,p_revision_reason text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v integer; statement_id uuid;
begin
 if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'AUTHORIZATION_REQUIRED'; end if;
 if p_pdf_base64 is null or length(p_pdf_base64)=0 then raise exception 'STATEMENT_PDF_REQUIRED'; end if;
 select coalesce(max(version),0)+1 into v from public.zynth_vault_statements where user_id=p_user_id and period_start=p_period_start and period_end=p_period_end;
 insert into public.zynth_vault_statements(user_id,period_type,period_start,period_end,version,status,snapshot,pdf_bytes,content_hash,supersedes_id,revision_reason)
 values(p_user_id,p_period_type,p_period_start,p_period_end,v,case when v=1 then 'final' else 'revised' end,p_snapshot,decode(p_pdf_base64,'base64'),p_content_hash,p_supersedes_id,p_revision_reason)
 returning id into statement_id;
 return jsonb_build_object('id',statement_id,'version',v);
end; $$;
create or replace function public.zynth_statement_pdf(p_user_id uuid,p_statement_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r record;
begin
 if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'AUTHORIZATION_REQUIRED'; end if;
 select id,period_start,version,pdf_bytes into r from public.zynth_vault_statements where id=p_statement_id and user_id=p_user_id;
 if not found or r.pdf_bytes is null then raise exception 'STATEMENT_PDF_UNAVAILABLE'; end if;
 return jsonb_build_object('id',r.id,'period_start',r.period_start,'version',r.version,'pdf_bytes',encode(r.pdf_bytes,'base64'));
end; $$;
revoke execute on function public.zynth_statement_insert_base64(uuid,text,date,date,jsonb,text,text,uuid,text) from public,anon;
grant execute on function public.zynth_statement_insert_base64(uuid,text,date,date,jsonb,text,text,uuid,text) to authenticated;
revoke execute on function public.zynth_statement_pdf(uuid,uuid) from public,anon;
grant execute on function public.zynth_statement_pdf(uuid,uuid) to authenticated;
