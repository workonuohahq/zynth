-- Normalize legacy Admin RPC authorization to the multi-role authorization model.
-- Admin access is determined by zynth_user_roles/zynth_roles via zynth_has_role().
-- Active account status remains required where the previous function required it.

do $$
declare r record;
declare d text;
declare nd text;
begin
  for r in
    select p.oid, pg_get_functiondef(p.oid) as def
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and (p.proname ilike 'admin_%' or p.proname ilike 'zynth_admin_%' or p.proname='process_withdrawal_action')
      and pg_get_functiondef(p.oid) like '%role=''admin''%'
  loop
    d := r.def;
    nd := replace(
      d,
      'not exists(select 1 from public.users where id=auth.uid() and role=''admin'' and account_status=''active'')',
      '(not public.zynth_has_role(auth.uid(),''admin'') or not exists(select 1 from public.users where id=auth.uid() and account_status=''active''))'
    );
    nd := replace(
      nd,
      'not exists(select 1 from public.users where id=auth.uid() and role=''admin'')',
      'not public.zynth_has_role(auth.uid(),''admin'')'
    );
    nd := replace(
      nd,
      'not exists(select 1 from public.users where id=p_admin_id and role=''admin'' and account_status=''active'')',
      '(not public.zynth_has_role(auth.uid(),''admin'') or not exists(select 1 from public.users where id=auth.uid() and account_status=''active''))'
    );
    if nd <> d then
      execute nd;
    end if;
  end loop;
end $$;

-- Admin RPCs are invoked through authenticated server routes; do not expose them to anon.
do $$
declare r record;
begin
  for r in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and (p.proname ilike 'admin_%' or p.proname ilike 'zynth_admin_%' or p.proname='process_withdrawal_action')
  loop
    execute format('revoke execute on function public.%I(%s) from anon', r.proname, r.args);
  end loop;
end $$;
