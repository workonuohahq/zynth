-- ZYNTH withdrawal command center / payout destination foundation
alter table public.system_settings add column if not exists global_min_withdrawal numeric not null default 1000 check (global_min_withdrawal > 0);
alter table public.system_settings add column if not exists withdrawals_enabled boolean not null default true;
alter table public.system_settings add column if not exists withdrawal_processing_notice text not null default 'Withdrawals are reviewed manually. Most requests are processed during normal operations.';

create table if not exists public.withdrawal_beneficiaries (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.users(id) on delete cascade,
 bank_name text not null,
 account_number text not null check (account_number ~ '^[0-9]{10}$'),
 account_name text not null,
 is_verified boolean not null default false,
 is_default boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id,account_number)
);
create index if not exists withdrawal_beneficiaries_user_idx on public.withdrawal_beneficiaries(user_id,created_at desc);
alter table public.withdrawal_beneficiaries enable row level security;
revoke all on public.withdrawal_beneficiaries from anon,authenticated;
grant select,insert,update,delete on public.withdrawal_beneficiaries to authenticated;
drop policy if exists "users_manage_own_withdrawal_beneficiaries" on public.withdrawal_beneficiaries;
create policy "users_manage_own_withdrawal_beneficiaries" on public.withdrawal_beneficiaries for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

create table if not exists public.withdrawal_requests (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.users(id) on delete restrict,
 transaction_id uuid unique references public.transactions(id) on delete restrict,
 beneficiary_id uuid references public.withdrawal_beneficiaries(id) on delete set null,
 reference text not null unique,
 gross_amount numeric not null check (gross_amount>0),
 fee_amount numeric not null default 0 check (fee_amount>=0),
 net_amount numeric not null check (net_amount>0),
 fee_pct numeric not null default 0 check (fee_pct>=0 and fee_pct<=100),
 currency text not null default 'NGN',
 bank_name text not null,
 account_number text not null,
 account_name text not null,
 status text not null default 'pending' check (status in ('pending','under_review','processing','paid','rejected','cancelled','failed')),
 failure_reason text,
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 processing_at timestamptz,
 paid_at timestamptz,
 cancelled_at timestamptz,
 reviewed_by uuid references public.users(id),
 processed_by uuid references public.users(id),
 metadata jsonb not null default '{}'::jsonb
);
create index if not exists withdrawal_requests_user_created_idx on public.withdrawal_requests(user_id,created_at desc);
create index if not exists withdrawal_requests_queue_idx on public.withdrawal_requests(status,created_at asc);
create index if not exists withdrawal_requests_beneficiary_idx on public.withdrawal_requests(beneficiary_id);
create index if not exists withdrawal_requests_reviewed_by_idx on public.withdrawal_requests(reviewed_by);
create index if not exists withdrawal_requests_processed_by_idx on public.withdrawal_requests(processed_by);
create unique index if not exists withdrawal_requests_one_active_per_user on public.withdrawal_requests(user_id) where status in ('pending','under_review','processing');
alter table public.withdrawal_requests enable row level security;
revoke all on public.withdrawal_requests from anon,authenticated;
grant select on public.withdrawal_requests to authenticated;
drop policy if exists "users_read_own_withdrawal_requests" on public.withdrawal_requests;
create policy "users_read_own_withdrawal_requests" on public.withdrawal_requests for select to authenticated using ((select auth.uid())=user_id);

drop function if exists public.request_withdrawal(uuid,numeric);
drop function if exists public.process_withdrawal(uuid,boolean,uuid,text);

create or replace function public.request_withdrawal(p_user_id uuid,p_amount numeric,p_beneficiary_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare wallet numeric;fee_pct numeric;fee numeric;net numeric;min_withdrawal numeric;enabled boolean;state text;b public.withdrawal_beneficiaries%rowtype;wid uuid;tid uuid;ref text;
begin
 if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'AUTHORIZATION_REQUIRED'; end if;
 select main_wallet_balance,account_status into wallet,state from public.users where id=p_user_id for update;
 if wallet is null then raise exception 'USER_NOT_FOUND'; end if;
 if state in ('restricted','suspended','deactivated') then raise exception 'ACCOUNT_RESTRICTED'; end if;
 select withdrawals_enabled,global_min_withdrawal,exit_fee_pct into enabled,min_withdrawal,fee_pct from public.system_settings where id='00000000-0000-0000-0000-000000000001';
 if not coalesce(enabled,true) then raise exception 'WITHDRAWALS_DISABLED'; end if;
 if p_amount is null or p_amount<=0 then raise exception 'INVALID_AMOUNT'; end if;
 if p_amount<min_withdrawal then raise exception 'WITHDRAWAL_TOO_SMALL'; end if;
 if exists(select 1 from public.deposit_requests where user_id=p_user_id and status='pending') then raise exception 'PENDING_DEPOSIT_EXISTS'; end if;
 if exists(select 1 from public.withdrawal_requests where user_id=p_user_id and status in ('pending','under_review','processing')) then raise exception 'PENDING_WITHDRAWAL_EXISTS'; end if;
 if wallet<p_amount then raise exception 'INSUFFICIENT_BALANCE'; end if;
 if p_beneficiary_id is null then raise exception 'BENEFICIARY_REQUIRED'; end if;
 select * into b from public.withdrawal_beneficiaries where id=p_beneficiary_id and user_id=p_user_id;
 if not found then raise exception 'BENEFICIARY_NOT_FOUND'; end if;
 fee:=round(p_amount*fee_pct/100,2);net:=p_amount-fee;if net<=0 then raise exception 'WITHDRAWAL_TOO_SMALL';end if;
 ref:='ZYN-WD-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
 update public.users set main_wallet_balance=main_wallet_balance-p_amount,updated_at=now() where id=p_user_id;
 insert into public.transactions(user_id,type,amount,status,reference,metadata) values(p_user_id,'withdrawal',net,'pending',ref,jsonb_build_object('gross_amount',p_amount,'fee_amount',fee,'fee_pct',fee_pct,'beneficiary_id',b.id)) returning id into tid;
 insert into public.transactions(user_id,type,amount,status,reference,metadata) values(p_user_id,'fee_deduction',fee,'completed','FEE-'||tid,jsonb_build_object('withdrawal_id',tid,'fee_pct',fee_pct));
 insert into public.withdrawal_requests(user_id,transaction_id,beneficiary_id,reference,gross_amount,fee_amount,net_amount,fee_pct,bank_name,account_number,account_name,status) values(p_user_id,tid,b.id,ref,p_amount,fee,net,fee_pct,b.bank_name,b.account_number,b.account_name,'pending') returning id into wid;
 update public.transactions set metadata=coalesce(metadata,'{}')||jsonb_build_object('withdrawal_request_id',wid) where id=tid;
 return jsonb_build_object('withdrawal_id',wid,'transaction_id',tid,'reference',ref,'gross',p_amount,'fee',fee,'net',net,'fee_pct',fee_pct,'status','pending');
end;$$;

create or replace function public.process_withdrawal_action(p_withdrawal_id uuid,p_action text,p_admin_user_id uuid,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare w public.withdrawal_requests%rowtype;t public.transactions%rowtype;gross numeric;new_status text;reason text;
begin
 if auth.uid() is null or auth.uid()<>p_admin_user_id or not exists(select 1 from public.users where id=auth.uid() and role='admin') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED';end if;
 select * into w from public.withdrawal_requests where id=p_withdrawal_id for update;if not found then raise exception 'WITHDRAWAL_NOT_FOUND';end if;
 select * into t from public.transactions where id=w.transaction_id for update;gross:=w.gross_amount;reason:=coalesce(nullif(trim(p_reason),''),'Withdrawal rejected');
 if p_action='review' and w.status='pending' then
  update public.withdrawal_requests set status='under_review',reviewed_at=now(),reviewed_by=auth.uid() where id=w.id;
  insert into public.notifications(user_id,title,body,type,metadata) values(w.user_id,'Withdrawal under review','Your withdrawal request is now being reviewed by the ZYNTH operations team.','withdrawal',jsonb_build_object('withdrawal_id',w.id,'reference',w.reference,'event','under_review'));new_status:='under_review';
 elsif p_action='processing' and w.status in ('pending','under_review') then
  update public.withdrawal_requests set status='processing',processing_at=now(),processed_by=auth.uid() where id=w.id;
  insert into public.notifications(user_id,title,body,type,metadata) values(w.user_id,'Withdrawal processing','Your withdrawal has been approved for payout and is now being processed.','withdrawal',jsonb_build_object('withdrawal_id',w.id,'reference',w.reference,'event','processing'));new_status:='processing';
 elsif p_action='paid' and w.status='processing' then
  update public.withdrawal_requests set status='paid',paid_at=now(),processed_by=auth.uid() where id=w.id;
  update public.transactions set status='completed',processed_at=now(),processed_by=auth.uid() where id=t.id;
  insert into public.notifications(user_id,title,body,type,metadata) values(w.user_id,'Withdrawal paid','Your withdrawal has been marked as paid. ₦'||to_char(w.net_amount,'FM999G999G999G990D00')||' was sent to your registered account.','withdrawal',jsonb_build_object('withdrawal_id',w.id,'reference',w.reference,'event','paid','net',w.net_amount));new_status:='paid';
 elsif p_action='reject' and w.status in ('pending','under_review') then
  update public.users set main_wallet_balance=main_wallet_balance+gross,updated_at=now() where id=w.user_id;
  update public.withdrawal_requests set status='rejected',failure_reason=reason,reviewed_at=coalesce(reviewed_at,now()),reviewed_by=coalesce(reviewed_by,auth.uid()),processed_by=auth.uid() where id=w.id;
  update public.transactions set status='failed',processed_at=now(),processed_by=auth.uid(),failure_reason=reason where id=t.id;
  insert into public.transactions(user_id,type,amount,status,reference,metadata) values(w.user_id,'deposit',gross,'completed','REFUND-'||t.id,jsonb_build_object('source','withdrawal_refund','withdrawal_id',t.id,'reason',reason));
  update public.transactions set status='failed',failure_reason='Withdrawal rejected',metadata=coalesce(metadata,'{}')||jsonb_build_object('rejected_at',now()) where user_id=w.user_id and type='fee_deduction' and metadata->>'withdrawal_id'=t.id::text and status='completed';
  insert into public.notifications(user_id,title,body,type,metadata) values(w.user_id,'Withdrawal rejected','Your withdrawal was rejected and ₦'||to_char(gross,'FM999G999G999G990D00')||' has been returned to your available balance. Reason: '||reason,'withdrawal',jsonb_build_object('withdrawal_id',w.id,'reference',w.reference,'event','rejected','reason',reason));new_status:='rejected';
 else raise exception 'INVALID_WITHDRAWAL_TRANSITION';end if;
 insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values(auth.uid(),'withdrawal.'||p_action,'withdrawal_request',w.id,jsonb_build_object('reference',w.reference,'from_status',w.status,'to_status',new_status,'reason',p_reason));
 return jsonb_build_object('ok',true,'withdrawal_id',w.id,'reference',w.reference,'status',new_status);
end;$$;

create or replace function public.cancel_withdrawal_request(p_user_id uuid,p_withdrawal_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare w public.withdrawal_requests%rowtype;t public.transactions%rowtype;gross numeric;
begin
 if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'AUTHORIZATION_REQUIRED';end if;
 select * into w from public.withdrawal_requests where id=p_withdrawal_id and user_id=p_user_id for update;if not found then raise exception 'WITHDRAWAL_NOT_FOUND';end if;
 if w.status<>'pending' then raise exception 'WITHDRAWAL_NOT_PENDING';end if;
 select * into t from public.transactions where id=w.transaction_id for update;gross:=w.gross_amount;
 update public.users set main_wallet_balance=main_wallet_balance+gross,updated_at=now() where id=p_user_id;
 update public.withdrawal_requests set status='cancelled',cancelled_at=now(),failure_reason='Cancelled by user' where id=w.id;
 update public.transactions set status='failed',failure_reason='Cancelled by user',processed_at=now(),metadata=coalesce(metadata,'{}')||jsonb_build_object('cancelled_at',now(),'cancelled_by','user') where id=t.id;
 update public.transactions set status='failed',failure_reason='Withdrawal cancelled by user',metadata=coalesce(metadata,'{}')||jsonb_build_object('cancelled_at',now()) where user_id=p_user_id and type='fee_deduction' and metadata->>'withdrawal_id'=t.id::text and status='completed';
 insert into public.transactions(user_id,type,amount,status,reference,metadata) values(p_user_id,'deposit',gross,'completed','REFUND-'||t.id,jsonb_build_object('source','withdrawal_cancellation_refund','withdrawal_id',t.id));
 insert into public.notifications(user_id,title,body,type,metadata) values(p_user_id,'Withdrawal cancelled','Your withdrawal was cancelled. ₦'||to_char(gross,'FM999G999G999G990D00')||' has been returned to your available balance.','withdrawal',jsonb_build_object('withdrawal_id',w.id,'reference',w.reference,'event','cancelled'));
 return jsonb_build_object('ok',true,'status','cancelled','withdrawal_id',w.id,'reference',w.reference,'refunded',gross);
end;$$;

create or replace function public.admin_withdrawal_queue()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not exists(select 1 from public.users where id=auth.uid() and role='admin') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED';end if;
 return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at asc) from (select w.*,u.email,u.full_name,u.account_status,extract(epoch from(now()-w.created_at))/3600 as age_hours from public.withdrawal_requests w join public.users u on u.id=w.user_id where w.status in ('pending','under_review','processing') order by w.created_at asc limit 100)x),'[]'::jsonb);
end;$$;

create or replace function public.admin_set_withdrawal_settings(p_admin_user_id uuid,p_min_withdrawal numeric,p_enabled boolean,p_notice text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or auth.uid()<>p_admin_user_id or not exists(select 1 from public.users where id=auth.uid() and role='admin') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED';end if;
 if p_min_withdrawal<=0 then raise exception 'INVALID_MIN_WITHDRAWAL';end if;
 update public.system_settings set global_min_withdrawal=p_min_withdrawal,withdrawals_enabled=p_enabled,withdrawal_processing_notice=left(coalesce(p_notice,''),500),updated_at=now() where id='00000000-0000-0000-0000-000000000001';
 return (select jsonb_build_object('global_min_withdrawal',global_min_withdrawal,'withdrawals_enabled',withdrawals_enabled,'withdrawal_processing_notice',withdrawal_processing_notice) from public.system_settings where id='00000000-0000-0000-0000-000000000001');
end;$$;

revoke execute on function public.request_withdrawal(uuid,numeric,uuid) from public,anon;
revoke execute on function public.cancel_withdrawal_request(uuid,uuid) from public,anon;
revoke execute on function public.process_withdrawal_action(uuid,text,uuid,text) from public,anon;
revoke execute on function public.admin_withdrawal_queue() from public,anon;
revoke execute on function public.admin_set_withdrawal_settings(uuid,numeric,boolean,text) from public,anon;
grant execute on function public.request_withdrawal(uuid,numeric,uuid) to authenticated;
grant execute on function public.cancel_withdrawal_request(uuid,uuid) to authenticated;
grant execute on function public.process_withdrawal_action(uuid,text,uuid,text) to authenticated;
grant execute on function public.admin_withdrawal_queue() to authenticated;
grant execute on function public.admin_set_withdrawal_settings(uuid,numeric,boolean,text) to authenticated;


-- User-safe read path for withdrawal policy. system_settings is intentionally deny-all under RLS.
create or replace function public.get_withdrawal_policy()
returns table(
  exit_fee_pct numeric,
  global_min_withdrawal numeric,
  withdrawals_enabled boolean,
  withdrawal_processing_notice text
)
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  return query
  select
    s.exit_fee_pct,
    s.global_min_withdrawal,
    s.withdrawals_enabled,
    s.withdrawal_processing_notice
  from public.system_settings s
  limit 1;
end;
$$;

revoke all on function public.get_withdrawal_policy() from public;
grant execute on function public.get_withdrawal_policy() to authenticated;


-- Security hardening: the user withdrawal policy RPC must never be callable anonymously.
revoke execute on function public.get_withdrawal_policy() from public;
grant execute on function public.get_withdrawal_policy() to authenticated;
