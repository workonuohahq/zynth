-- ZYNTH admin user command center
-- Versioned copy of the database changes applied to production on 2026-09-25.

alter table public.users add column if not exists account_status text not null default 'active';
do $$
begin
  if not exists (select 1 from pg_constraint where conname='users_account_status_check' and conrelid='public.users'::regclass) then
    alter table public.users add constraint users_account_status_check check (account_status in ('active','restricted','suspended','deactivated'));
  end if;
end $$;

create table if not exists public.admin_user_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  admin_user_id uuid not null references public.users(id),
  note text not null check (length(trim(note)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists admin_user_notes_user_created_idx on public.admin_user_notes(user_id, created_at desc);
alter table public.admin_user_notes enable row level security;
revoke all on table public.admin_user_notes from anon, authenticated;
grant select, insert on table public.admin_user_notes to authenticated;

create index if not exists users_account_status_idx on public.users(account_status);
create index if not exists users_created_at_idx on public.users(created_at desc);

-- Admin RPCs intentionally remain behind authenticated execution and perform their own admin-role checks.
create or replace function public.admin_users_list(p_search text default null,p_status text default null,p_kyc text default null,p_limit integer default 50,p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.users where id=auth.uid() and role='admin') then raise exception 'admin authorization required'; end if;
 p_limit:=least(greatest(coalesce(p_limit,50),1),100); p_offset:=greatest(coalesce(p_offset,0),0);
 select jsonb_build_object('total',count(*) over(),'items',jsonb_agg(to_jsonb(x) order by x.created_at desc)) into result
 from (
   select u.id,u.email,u.full_name,u.role,u.kyc_verified,u.account_status,u.main_wallet_balance,u.locked_vault_balance,u.created_at,u.updated_at,
   au.last_sign_in_at,
   (select count(*) from public.vaults v where v.user_id=u.id) vault_count,
   (select count(*) from public.vaults v where v.user_id=u.id and v.status='active') active_vaults,
   (select coalesce(sum(t.amount),0) from public.transactions t where t.user_id=u.id and t.type='deposit' and t.status='completed') total_deposited,
   (select coalesce(sum(t.amount),0) from public.transactions t where t.user_id=u.id and t.type='withdrawal' and t.status='completed') total_withdrawn,
   (select coalesce(sum(t.amount),0) from public.transactions t where t.user_id=u.id and t.type='zpa_commission' and t.status='completed') zpa_earnings,
   (select count(*) from public.deposit_requests d where d.user_id=u.id and d.status='pending') pending_deposits,
   (select count(*) from public.transactions t where t.user_id=u.id and t.type='withdrawal' and t.status='pending') pending_withdrawals
   from public.users u left join auth.users au on au.id=u.id
   where (nullif(trim(p_search),'') is null or u.email ilike '%'||trim(p_search)||'%' or coalesce(u.full_name,'') ilike '%'||trim(p_search)||'%' or u.id::text ilike '%'||trim(p_search)||'%')
   and (nullif(trim(p_status),'') is null or u.account_status=p_status)
   and (nullif(trim(p_kyc),'') is null or (p_kyc='verified' and u.kyc_verified=true) or (p_kyc='unverified' and u.kyc_verified=false))
   order by u.created_at desc limit p_limit offset p_offset
 ) x;
 if result is null then result:=jsonb_build_object('total',0,'items','[]'::jsonb); else result:=jsonb_set(result,'{items}',coalesce(result->'items','[]'::jsonb)); end if;
 return result;
end $$;

create or replace function public.admin_get_user_detail(p_admin_user_id uuid,p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if auth.uid() is null or auth.uid()<>p_admin_user_id or not exists(select 1 from public.users where id=auth.uid() and role='admin') then raise exception 'admin authorization required'; end if;
 if not exists(select 1 from public.users where id=p_user_id) then raise exception 'USER_NOT_FOUND'; end if;
 select jsonb_build_object(
  'profile',(select jsonb_build_object('id',u.id,'email',u.email,'full_name',u.full_name,'role',u.role,'kyc_verified',u.kyc_verified,'account_status',u.account_status,'main_wallet_balance',u.main_wallet_balance,'locked_vault_balance',u.locked_vault_balance,'referred_by',u.referred_by,'created_at',u.created_at,'updated_at',u.updated_at,'last_sign_in_at',au.last_sign_in_at) from public.users u left join auth.users au on au.id=u.id where u.id=p_user_id),
  'stats',jsonb_build_object('vault_count',(select count(*) from public.vaults where user_id=p_user_id),'active_vaults',(select count(*) from public.vaults where user_id=p_user_id and status='active'),'projected_profit',(select coalesce(sum(expected_yield),0) from public.vaults where user_id=p_user_id and status='active'),'total_deposited',(select coalesce(sum(amount),0) from public.transactions where user_id=p_user_id and type='deposit' and status='completed'),'total_withdrawn',(select coalesce(sum(amount),0) from public.transactions where user_id=p_user_id and type='withdrawal' and status='completed'),'zpa_earnings',(select coalesce(sum(amount),0) from public.transactions where user_id=p_user_id and type='zpa_commission' and status='completed')),
  'vaults',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select id,principal_amount,expected_yield,start_date,maturity_date,status,created_at from public.vaults where user_id=p_user_id order by created_at desc limit 50)x),'[]'::jsonb),
  'deposits',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select id,amount,method,status,reference,payment_reference,user_note,admin_note,created_at,processed_at,processed_by from public.deposit_requests where user_id=p_user_id order by created_at desc limit 50)x),'[]'::jsonb),
  'withdrawals',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select id,amount,status,reference,metadata,created_at,processed_at,processed_by,failure_reason from public.transactions where user_id=p_user_id and type='withdrawal' order by created_at desc limit 50)x),'[]'::jsonb),
  'transactions',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select id,type,amount,status,reference,metadata,created_at,processed_at,processed_by,failure_reason from public.transactions where user_id=p_user_id order by created_at desc limit 100)x),'[]'::jsonb),
  'zpa',coalesce((select to_jsonb(a) from public.agent_profiles a where a.user_id=p_user_id limit 1),'null'::jsonb),
  'notes',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select n.id,n.note,n.created_at,n.admin_user_id,coalesce(a.full_name,a.email,'Administrator') admin_name from public.admin_user_notes n left join public.users a on a.id=n.admin_user_id where n.user_id=p_user_id order by n.created_at desc limit 50)x),'[]'::jsonb),
  'activity',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select id,action,target_type,target_id,metadata,created_at from public.audit_logs where target_id=p_user_id or (target_type='user' and target_id=p_user_id) order by created_at desc limit 50)x),'[]'::jsonb)
 ) into result;
 return result;
end $$;

create or replace function public.admin_update_user(p_admin_user_id uuid,p_user_id uuid,p_full_name text,p_kyc_verified boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare old public.users%rowtype; new_row public.users%rowtype;
begin
 if auth.uid() is null or auth.uid()<>p_admin_user_id or not exists(select 1 from public.users where id=auth.uid() and role='admin') then raise exception 'admin authorization required'; end if;
 select * into old from public.users where id=p_user_id for update; if not found then raise exception 'USER_NOT_FOUND'; end if;
 update public.users set full_name=nullif(trim(p_full_name),''),kyc_verified=coalesce(p_kyc_verified,kyc_verified),updated_at=now() where id=p_user_id returning * into new_row;
 insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values(auth.uid(),'user.profile_updated','user',p_user_id,jsonb_build_object('full_name_changed',old.full_name is distinct from new_row.full_name,'kyc_changed',old.kyc_verified is distinct from new_row.kyc_verified,'kyc_verified',new_row.kyc_verified));
 return jsonb_build_object('ok',true,'user_id',p_user_id,'full_name',new_row.full_name,'kyc_verified',new_row.kyc_verified);
end $$;

create or replace function public.admin_set_user_status(p_admin_user_id uuid,p_user_id uuid,p_status text,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare old_status text;
begin
 if auth.uid() is null or auth.uid()<>p_admin_user_id or not exists(select 1 from public.users where id=auth.uid() and role='admin') then raise exception 'admin authorization required'; end if;
 if p_status not in ('active','restricted','suspended','deactivated') then raise exception 'INVALID_ACCOUNT_STATUS'; end if;
 if p_user_id=auth.uid() and p_status<>'active' then raise exception 'CANNOT_DISABLE_SELF'; end if;
 select account_status into old_status from public.users where id=p_user_id for update; if not found then raise exception 'USER_NOT_FOUND'; end if;
 update public.users set account_status=p_status,updated_at=now() where id=p_user_id;
 insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values(auth.uid(),'user.status_changed','user',p_user_id,jsonb_build_object('from',old_status,'to',p_status,'reason',nullif(trim(p_reason),'')));
 return jsonb_build_object('ok',true,'status',p_status);
end $$;

create or replace function public.admin_adjust_wallet(p_admin_user_id uuid,p_user_id uuid,p_direction text,p_amount numeric,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u public.users%rowtype; ref text;
begin
 if auth.uid() is null or auth.uid()<>p_admin_user_id or not exists(select 1 from public.users where id=auth.uid() and role='admin') then raise exception 'admin authorization required'; end if;
 if p_amount is null or p_amount<=0 then raise exception 'INVALID_AMOUNT'; end if;
 if nullif(trim(p_reason),'') is null then raise exception 'REASON_REQUIRED'; end if;
 if p_direction not in ('credit','debit') then raise exception 'INVALID_DIRECTION'; end if;
 select * into u from public.users where id=p_user_id for update; if not found then raise exception 'USER_NOT_FOUND'; end if;
 if p_direction='debit' and u.main_wallet_balance<p_amount then raise exception 'INSUFFICIENT_AVAILABLE_BALANCE'; end if;
 update public.users set main_wallet_balance=case when p_direction='credit' then main_wallet_balance+p_amount else main_wallet_balance-p_amount end,updated_at=now() where id=p_user_id;
 ref:='ADM-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
 insert into public.transactions(user_id,type,amount,status,reference,metadata,processed_at,processed_by) values(p_user_id,case when p_direction='credit' then 'deposit'::transaction_type else 'fee_deduction'::transaction_type end,p_amount,'completed',ref,jsonb_build_object('admin_adjustment',true,'direction',p_direction,'reason',trim(p_reason),'admin_user_id',auth.uid()),now(),auth.uid());
 insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values(auth.uid(),case when p_direction='credit' then 'user.wallet_credited' else 'user.wallet_debited' end,'user',p_user_id,jsonb_build_object('amount',p_amount,'direction',p_direction,'reason',trim(p_reason),'reference',ref));
 select * into u from public.users where id=p_user_id;
 return jsonb_build_object('ok',true,'reference',ref,'main_wallet_balance',u.main_wallet_balance);
end $$;

create or replace function public.admin_add_user_note(p_admin_user_id uuid,p_user_id uuid,p_note text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare n public.admin_user_notes%rowtype;
begin
 if auth.uid() is null or auth.uid()<>p_admin_user_id or not exists(select 1 from public.users where id=auth.uid() and role='admin') then raise exception 'admin authorization required'; end if;
 if nullif(trim(p_note),'') is null then raise exception 'NOTE_REQUIRED'; end if;
 insert into public.admin_user_notes(user_id,admin_user_id,note) values(p_user_id,auth.uid(),trim(p_note)) returning * into n;
 insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values(auth.uid(),'user.note_added','user',p_user_id,jsonb_build_object('note_id',n.id));
 return jsonb_build_object('ok',true,'id',n.id,'note',n.note,'created_at',n.created_at);
end $$;

revoke execute on function public.admin_users_list(text,text,text,integer,integer) from public,anon;
revoke execute on function public.admin_get_user_detail(uuid,uuid) from public,anon;
revoke execute on function public.admin_update_user(uuid,uuid,text,boolean) from public,anon;
revoke execute on function public.admin_set_user_status(uuid,uuid,text,text) from public,anon;
revoke execute on function public.admin_adjust_wallet(uuid,uuid,text,numeric,text) from public,anon;
revoke execute on function public.admin_add_user_note(uuid,uuid,text) from public,anon;
grant execute on function public.admin_users_list(text,text,text,integer,integer) to authenticated;
grant execute on function public.admin_get_user_detail(uuid,uuid) to authenticated;
grant execute on function public.admin_update_user(uuid,uuid,text,boolean) to authenticated;
grant execute on function public.admin_set_user_status(uuid,uuid,text,text) to authenticated;
grant execute on function public.admin_adjust_wallet(uuid,uuid,text,numeric,text) to authenticated;
grant execute on function public.admin_add_user_note(uuid,uuid,text) to authenticated;

-- Financial operations respect admin account restrictions.
-- The production definitions include the same ACCOUNT_RESTRICTED guard before any balance mutation.

create index if not exists admin_user_notes_admin_created_idx on public.admin_user_notes(admin_user_id,created_at desc);
drop policy if exists "admins_manage_admin_user_notes" on public.admin_user_notes;
create policy "admins_manage_admin_user_notes" on public.admin_user_notes for all to authenticated
using (exists(select 1 from public.users where id=(select auth.uid()) and role='admin'))
with check (exists(select 1 from public.users where id=(select auth.uid()) and role='admin'));
