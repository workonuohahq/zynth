-- Deep hardening of the withdrawal engine.
-- Atomic reservations, per-user serialization, fee reversal, explicit sources,
-- idempotent profit restoration, internal helper lockdown and accounting invariants.

create unique index if not exists withdrawal_requests_one_active_per_user_idx
on public.withdrawal_requests(user_id)
where status in ('pending','under_review','processing');

create index if not exists withdrawal_requests_status_created_idx
on public.withdrawal_requests(status, created_at);

create index if not exists withdrawal_requests_user_status_idx
on public.withdrawal_requests(user_id, status);

create or replace function public.request_withdrawal(p_user_id uuid,p_amount numeric,p_beneficiary_id uuid)
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $$
declare wallet numeric;fee_pct numeric;fee numeric;net numeric;min_withdrawal numeric;enabled boolean;state text;b public.withdrawal_beneficiaries%rowtype;wid uuid;tid uuid;ref text;
begin
 if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'AUTHORIZATION_REQUIRED'; end if;
 select main_wallet_balance,account_status into wallet,state from public.users where id=p_user_id for update;
 if not found then raise exception 'USER_NOT_FOUND'; end if;
 if state in ('restricted','suspended','deactivated') then raise exception 'ACCOUNT_RESTRICTED'; end if;
 select withdrawals_enabled,global_min_withdrawal,exit_fee_pct into enabled,min_withdrawal,fee_pct from public.system_settings where id='00000000-0000-0000-0000-000000000001';
 if not coalesce(enabled,true) then raise exception 'WITHDRAWALS_DISABLED'; end if;
 if p_amount is null or p_amount<=0 then raise exception 'INVALID_AMOUNT'; end if;
 if p_amount<coalesce(min_withdrawal,0) then raise exception 'WITHDRAWAL_TOO_SMALL'; end if;
 if exists(select 1 from public.deposit_requests where user_id=p_user_id and status='pending') then raise exception 'PENDING_DEPOSIT_EXISTS'; end if;
 if exists(select 1 from public.withdrawal_requests where user_id=p_user_id and status in ('pending','under_review','processing')) then raise exception 'PENDING_WITHDRAWAL_EXISTS'; end if;
 if wallet<p_amount then raise exception 'INSUFFICIENT_BALANCE'; end if;
 if p_beneficiary_id is null then raise exception 'BENEFICIARY_REQUIRED'; end if;
 select * into b from public.withdrawal_beneficiaries where id=p_beneficiary_id and user_id=p_user_id;
 if not found then raise exception 'BENEFICIARY_NOT_FOUND'; end if;
 fee:=round(p_amount*coalesce(fee_pct,0)/100,2); net:=round(p_amount-fee,2);
 if net<=0 then raise exception 'WITHDRAWAL_TOO_SMALL'; end if;
 ref:='ZYN-WD-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
 update public.users set main_wallet_balance=main_wallet_balance-p_amount,updated_at=now() where id=p_user_id;
 insert into public.transactions(user_id,type,amount,status,reference,metadata)
 values(p_user_id,'withdrawal',net,'pending',ref,jsonb_build_object('gross_amount',p_amount,'fee_amount',fee,'fee_pct',coalesce(fee_pct,0),'beneficiary_id',b.id,'withdrawal_source','wallet')) returning id into tid;
 insert into public.transactions(user_id,type,amount,status,reference,metadata)
 values(p_user_id,'fee_deduction',fee,'pending','FEE-'||tid,jsonb_build_object('withdrawal_id',tid,'fee_pct',coalesce(fee_pct,0),'source','wallet'));
 insert into public.withdrawal_requests(user_id,transaction_id,beneficiary_id,reference,gross_amount,fee_amount,net_amount,fee_pct,bank_name,account_number,account_name,status,withdrawal_source)
 values(p_user_id,tid,b.id,ref,p_amount,fee,net,coalesce(fee_pct,0),b.bank_name,b.account_number,b.account_name,'pending','wallet') returning id into wid;
 update public.transactions set metadata=coalesce(metadata,'{}')||jsonb_build_object('withdrawal_request_id',wid) where id=tid;
 return jsonb_build_object('withdrawal_id',wid,'transaction_id',tid,'reference',ref,'gross',p_amount,'fee',fee,'net',net,'fee_pct',coalesce(fee_pct,0),'status','pending');
exception when unique_violation then raise exception 'PENDING_WITHDRAWAL_EXISTS';
end $$;

create or replace function public.request_profit_withdrawal(p_user_id uuid,p_amount numeric,p_beneficiary_id uuid)
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $$
declare eligible numeric;fee_pct numeric;fee numeric;net numeric;minw numeric;enabled boolean;state text;b public.withdrawal_beneficiaries%rowtype;wid uuid;tid uuid;ref text;remaining numeric;lot record;take numeric;allocations jsonb:='[]'::jsonb;lot_ids uuid[]:='{}';wallet numeric;
begin
 if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'AUTHORIZATION_REQUIRED'; end if;
 select main_wallet_balance,account_status into wallet,state from public.users where id=p_user_id for update;
 if not found then raise exception 'USER_NOT_FOUND'; end if;
 if state in ('restricted','suspended','deactivated') then raise exception 'ACCOUNT_RESTRICTED'; end if;
 if p_amount is null or p_amount<=0 then raise exception 'INVALID_AMOUNT'; end if;
 select withdrawals_enabled,global_min_withdrawal,exit_fee_pct into enabled,minw,fee_pct from public.system_settings where id='00000000-0000-0000-0000-000000000001';
 if not coalesce(enabled,true) then raise exception 'WITHDRAWALS_DISABLED'; end if;
 if p_amount<coalesce(minw,0) then raise exception 'WITHDRAWAL_TOO_SMALL'; end if;
 if exists(select 1 from public.deposit_requests where user_id=p_user_id and status='pending') then raise exception 'PENDING_DEPOSIT_EXISTS'; end if;
 if exists(select 1 from public.withdrawal_requests where user_id=p_user_id and status in ('pending','under_review','processing')) then raise exception 'PENDING_WITHDRAWAL_EXISTS'; end if;
 select * into b from public.withdrawal_beneficiaries where id=p_beneficiary_id and user_id=p_user_id;
 if not found then raise exception 'BENEFICIARY_NOT_FOUND'; end if;
 perform public.zynth_refresh_profit_lot_statuses();
 select least(coalesce(sum(l.profit_amount-l.withdrawn_amount) filter(where l.unlock_at<=now() and l.withdrawn_amount<l.profit_amount),0),coalesce((select sum(greatest(i.current_value-i.principal_remaining,0)) from public.zynth_investments i where i.user_id=p_user_id and i.status='active'),0)) into eligible from public.zynth_profit_lots l where l.user_id=p_user_id;
 if p_amount>coalesce(eligible,0) then raise exception 'INSUFFICIENT_WITHDRAWABLE_PROFIT'; end if;
 fee:=round(p_amount*coalesce(fee_pct,0)/100,2);net:=round(p_amount-fee,2);if net<=0 then raise exception 'WITHDRAWAL_TOO_SMALL';end if;
 remaining:=p_amount;
 for lot in select * from public.zynth_profit_lots where user_id=p_user_id and unlock_at<=now() and withdrawn_amount<profit_amount order by unlock_at,created_at for update loop
  exit when remaining<=0; take:=least(remaining,lot.profit_amount-lot.withdrawn_amount);
  update public.zynth_profit_lots set withdrawn_amount=withdrawn_amount+take,status=case when withdrawn_amount+take>=profit_amount then 'withdrawn' else 'partially_withdrawn' end where id=lot.id;
  allocations:=allocations||jsonb_build_array(jsonb_build_object('lot_id',lot.id,'amount',take));lot_ids:=array_append(lot_ids,lot.id);remaining:=remaining-take;
 end loop;
 if remaining>0 then raise exception 'INSUFFICIENT_WITHDRAWABLE_PROFIT'; end if;
 ref:='ZYN-PROFIT-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
 insert into public.transactions(user_id,type,amount,status,reference,metadata) values(p_user_id,'profit_withdrawal',net,'pending',ref,jsonb_build_object('gross_amount',p_amount,'fee_amount',fee,'fee_pct',coalesce(fee_pct,0),'source','vault_profit','withdrawal_source','profit')) returning id into tid;
 insert into public.transactions(user_id,type,amount,status,reference,metadata) values(p_user_id,'fee_deduction',fee,'pending','FEE-'||tid,jsonb_build_object('withdrawal_id',tid,'fee_pct',coalesce(fee_pct,0),'source','vault_profit'));
 insert into public.withdrawal_requests(user_id,transaction_id,beneficiary_id,reference,gross_amount,fee_amount,net_amount,fee_pct,bank_name,account_number,account_name,status,withdrawal_source,metadata,profit_lot_ids)
 values(p_user_id,tid,b.id,ref,p_amount,fee,net,coalesce(fee_pct,0),b.bank_name,b.account_number,b.account_name,'pending','profit',jsonb_build_object('profit_allocations',allocations),lot_ids) returning id into wid;
 update public.transactions set metadata=metadata||jsonb_build_object('withdrawal_request_id',wid) where id=tid;
 return jsonb_build_object('withdrawal_id',wid,'transaction_id',tid,'gross',p_amount,'fee',fee,'net',net,'status','pending');
exception when unique_violation then raise exception 'PENDING_WITHDRAWAL_EXISTS';
end $$;

create or replace function public.restore_profit_withdrawal_allocations(p_withdrawal_id uuid)
returns void language plpgsql security definer set search_path='public','pg_temp' as $$
declare w public.withdrawal_requests%rowtype;x jsonb;amt numeric;lid uuid;
begin
 select * into w from public.withdrawal_requests where id=p_withdrawal_id for update;
 if not found or w.withdrawal_source<>'profit' then return; end if;
 if w.metadata ? 'profit_allocations_restored_at' then return; end if;
 for x in select * from jsonb_array_elements(coalesce(w.metadata->'profit_allocations','[]'::jsonb)) loop
  lid:=(x->>'lot_id')::uuid;amt:=greatest(0,coalesce((x->>'amount')::numeric,0));
  update public.zynth_profit_lots set withdrawn_amount=greatest(0,withdrawn_amount-amt),status=case when greatest(0,withdrawn_amount-amt)>=profit_amount then 'withdrawn' when greatest(0,withdrawn_amount-amt)>0 then 'partially_withdrawn' when unlock_at<=now() then 'available' else 'locked' end where id=lid and user_id=w.user_id;
 end loop;
 update public.withdrawal_requests set metadata=metadata||jsonb_build_object('profit_allocations_restored_at',now()) where id=w.id;
end $$;

create or replace function public.process_withdrawal_action(p_withdrawal_id uuid,p_action text,p_admin_user_id uuid,p_reason text default null)
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $$
declare w public.withdrawal_requests%rowtype;t public.transactions%rowtype;gross numeric;new_status text;reason text;
begin
 if auth.uid() is null or auth.uid()<>p_admin_user_id or not exists(select 1 from public.users where id=auth.uid() and role='admin' and account_status='active') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED';end if;
 select * into w from public.withdrawal_requests where id=p_withdrawal_id for update;if not found then raise exception 'WITHDRAWAL_NOT_FOUND';end if;
 select * into t from public.transactions where id=w.transaction_id for update;if not found then raise exception 'WITHDRAWAL_TRANSACTION_NOT_FOUND';end if;
 gross:=w.gross_amount;reason:=coalesce(nullif(trim(p_reason),''),'Withdrawal rejected');
 if p_action='review' and w.status='pending' then update public.withdrawal_requests set status='under_review',reviewed_at=now(),reviewed_by=auth.uid() where id=w.id;new_status:='under_review';
 elsif p_action='processing' and w.status in ('pending','under_review') then update public.withdrawal_requests set status='processing',processing_at=now(),processed_by=auth.uid() where id=w.id;new_status:='processing';
 elsif p_action='paid' and w.status='processing' then
  update public.withdrawal_requests set status='paid',paid_at=now(),processed_by=auth.uid() where id=w.id;
  update public.transactions set status='completed',processed_at=now(),processed_by=auth.uid() where id=t.id;
  update public.transactions set status='completed',processed_at=now(),processed_by=auth.uid() where metadata->>'withdrawal_id'=t.id::text and type='fee_deduction' and status='pending';
  new_status:='paid';
 elsif p_action='reject' and w.status in ('pending','under_review') then
  if w.withdrawal_source='wallet' then update public.users set main_wallet_balance=main_wallet_balance+gross,updated_at=now() where id=w.user_id; else perform public.restore_profit_withdrawal_allocations(w.id); end if;
  update public.withdrawal_requests set status='rejected',failure_reason=reason,reviewed_at=coalesce(reviewed_at,now()),reviewed_by=coalesce(reviewed_by,auth.uid()),processed_by=auth.uid() where id=w.id;
  update public.transactions set status='failed',processed_at=now(),processed_by=auth.uid(),failure_reason=reason where id=t.id;
  update public.transactions set status='failed',processed_at=now(),processed_by=auth.uid(),failure_reason=reason where metadata->>'withdrawal_id'=t.id::text and type='fee_deduction' and status='pending';
  new_status:='rejected';
 else raise exception 'INVALID_WITHDRAWAL_TRANSITION';
 end if;
 insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values(auth.uid(),'withdrawal.'||p_action,'withdrawal_request',w.id,jsonb_build_object('reference',w.reference,'source',w.withdrawal_source,'from_status',w.status,'to_status',new_status,'reason',p_reason));
 return jsonb_build_object('ok',true,'withdrawal_id',w.id,'status',new_status);
end $$;

create or replace function public.cancel_withdrawal_request(p_user_id uuid,p_withdrawal_id uuid)
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $$
declare w public.withdrawal_requests%rowtype;t public.transactions%rowtype;gross numeric;
begin
 if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'AUTHORIZATION_REQUIRED';end if;
 select * into w from public.withdrawal_requests where id=p_withdrawal_id and user_id=p_user_id for update;if not found then raise exception 'WITHDRAWAL_NOT_FOUND';end if;
 if w.status<>'pending' then raise exception 'WITHDRAWAL_NOT_PENDING';end if;
 select * into t from public.transactions where id=w.transaction_id for update;gross:=w.gross_amount;
 if w.withdrawal_source='wallet' then update public.users set main_wallet_balance=main_wallet_balance+gross,updated_at=now() where id=p_user_id; else perform public.restore_profit_withdrawal_allocations(w.id); end if;
 update public.withdrawal_requests set status='cancelled',cancelled_at=now(),failure_reason='Cancelled by user' where id=w.id;
 update public.transactions set status='failed',failure_reason='Cancelled by user',processed_at=now() where id=t.id;
 update public.transactions set status='failed',failure_reason='Cancelled by user',processed_at=now() where metadata->>'withdrawal_id'=t.id::text and type='fee_deduction' and status='pending';
 return jsonb_build_object('ok',true,'status','cancelled','withdrawal_id',w.id,'refunded',gross);
end $$;

revoke execute on function public.restore_profit_withdrawal_allocations(uuid) from public,anon,authenticated;
revoke execute on function public.zynth_refresh_profit_lot_statuses() from public,anon,authenticated;
revoke execute on function public.admin_withdrawal_detail(uuid) from public,anon;
revoke execute on function public.get_withdrawal_policy() from public,anon;
grant execute on function public.admin_withdrawal_detail(uuid) to authenticated;
grant execute on function public.get_withdrawal_policy() to authenticated;

do $$
begin
 if not exists(select 1 from pg_constraint where conname='withdrawal_requests_net_matches_gross_fee') then
  alter table public.withdrawal_requests add constraint withdrawal_requests_net_matches_gross_fee check(round(net_amount,2)=round(gross_amount-fee_amount,2));
 end if;
end $$;
