-- ZYNTH investor settlement accounting hardening
-- Strategy/trader P&L must never be written directly into investor realized P&L
-- or investor profit lots. Investor performance is derived from NAV movement.

create or replace function public.zynth_admin_settle_report(p_report_id uuid, p_admin_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  r public.zynth_daily_reports%rowtype;
  s public.zynth_strategies%rowtype;
  st public.zynth_settlements%rowtype;
  flow numeric;
  pnl numeric;
  ret numeric;
  previous_nav numeric;
  newnav numeric;
  beforev numeric;
  afterv numeric;
  investor_delta numeric;
  unrealized_alloc numeric;
  total_units numeric;
  unlock interval;
  inv record;
begin
  if auth.uid() is null or auth.uid()<>p_admin_id
     or not public.zynth_has_role(auth.uid(),'admin')
     or not exists(select 1 from public.users where id=auth.uid() and account_status='active')
  then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;

  select * into r from public.zynth_daily_reports where id=p_report_id for update;
  if not found then raise exception 'REPORT_NOT_FOUND'; end if;
  if r.status<>'pending' then raise exception 'REPORT_NOT_PENDING'; end if;

  select * into s from public.zynth_strategies where id=r.strategy_id for update;
  if not found then raise exception 'STRATEGY_NOT_FOUND'; end if;
  if s.status<>'active' then raise exception 'STRATEGY_NOT_ACTIVE'; end if;
  if r.trader_id<>s.trader_id then raise exception 'REPORT_TRADER_MISMATCH'; end if;
  if exists(
    select 1 from public.zynth_settlements
    where strategy_id=r.strategy_id and settlement_date=r.report_date and status='settled'
  ) then raise exception 'DATE_ALREADY_SETTLED'; end if;

  flow:=r.external_deposit-r.external_withdrawal;
  pnl:=r.trading_pnl;
  ret:=case when r.opening_balance=0 then 0 else pnl/r.opening_balance end;
  previous_nav:=s.nav;
  newnav:=round(previous_nav*(1+ret),8);
  if newnav<=0 then raise exception 'NAV_WOULD_BE_NONPOSITIVE'; end if;

  select coalesce(sum(current_value),0)
    into beforev
    from public.zynth_investments
    where strategy_id=s.id and status='active';

  select coalesce(sum(units),0)
    into total_units
    from public.zynth_investments
    where strategy_id=s.id and status='active';

  update public.zynth_strategies
  set nav=newnav,
      current_reported_balance=r.closing_balance,
      high_water_mark=greatest(high_water_mark,newnav),
      updated_at=now()
  where id=s.id;

  for inv in
    select * from public.zynth_investments
    where strategy_id=s.id and status='active'
    for update
  loop
    investor_delta:=round(inv.units*(newnav-previous_nav),8);
    unrealized_alloc:=case
      when total_units=0 then 0
      else round(r.unrealized_pnl*(inv.units/total_units),8)
    end;

    update public.zynth_investments
    set current_value=round(units*newnav,8),
        unrealized_pnl=unrealized_alloc,
        realized_profit=realized_profit+greatest(investor_delta,0),
        realized_loss=realized_loss+greatest(-investor_delta,0),
        updated_at=now()
    where id=inv.id;
  end loop;

  select coalesce(sum(current_value),0)
    into afterv
    from public.zynth_investments
    where strategy_id=s.id and status='active';

  insert into public.zynth_settlements(
    strategy_id,report_id,settlement_date,opening_balance,closing_balance,
    external_net_flow,trading_pnl,return_pct,previous_nav,nav,
    investor_value_before,investor_value_after,settled_by
  )
  values(
    s.id,r.id,r.report_date,r.opening_balance,r.closing_balance,flow,pnl,ret*100,
    previous_nav,newnav,beforev,afterv,p_admin_id
  )
  returning * into st;

  unlock:=make_interval(days=>coalesce(
    (select vault_profit_lock_days from public.system_settings limit 1),30
  ));

  for inv in
    select * from public.zynth_investments
    where strategy_id=s.id and status='active'
  loop
    investor_delta:=round(inv.units*(newnav-previous_nav),8);

    if investor_delta>0 then
      insert into public.zynth_profit_lots(
        investment_id,settlement_id,user_id,strategy_id,profit_amount,generated_at,unlock_at
      )
      values(
        inv.id,st.id,inv.user_id,s.id,investor_delta,now(),now()+unlock
      );
    end if;

    insert into public.zynth_investment_events(
      investment_id,user_id,strategy_id,event_type,amount,units,nav,metadata
    )
    values(
      inv.id,inv.user_id,s.id,'settled',investor_delta,inv.units,newnav,
      jsonb_build_object(
        'return_pct',ret*100,
        'settlement_id',st.id,
        'previous_nav',previous_nav,
        'new_nav',newnav,
        'investor_delta',investor_delta,
        'strategy_trading_pnl',r.trading_pnl,
        'strategy_realized_pnl',r.realized_pnl,
        'strategy_unrealized_pnl',r.unrealized_pnl
      )
    );
  end loop;

  insert into public.zynth_nav_history(
    strategy_id,nav_date,previous_nav,nav,return_pct,source_balance,
    performance_fee,settled_at,settlement_id
  )
  values(
    s.id,r.report_date,previous_nav,newnav,ret*100,r.closing_balance,0,now(),st.id
  )
  on conflict(strategy_id,nav_date) do update set
    previous_nav=excluded.previous_nav,
    nav=excluded.nav,
    return_pct=excluded.return_pct,
    source_balance=excluded.source_balance,
    settled_at=excluded.settled_at,
    settlement_id=excluded.settlement_id;

  update public.zynth_daily_reports
  set status='confirmed',
      trading_pnl=pnl,
      return_pct=ret*100,
      confirmed_at=now(),
      confirmed_by=p_admin_id
  where id=r.id;

  insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
  values(
    p_admin_id,'settlement.confirmed','zynth_settlement',st.id,
    jsonb_build_object(
      'strategy_id',s.id,
      'report_id',r.id,
      'return_pct',ret*100,
      'previous_nav',previous_nav,
      'nav',newnav,
      'strategy_trading_pnl',r.trading_pnl,
      'strategy_realized_pnl',r.realized_pnl,
      'strategy_unrealized_pnl',r.unrealized_pnl,
      'investor_value_before',beforev,
      'investor_value_after',afterv
    )
  );

  insert into public.notifications(user_id,title,body,type,metadata)
  select distinct i.user_id,
    'Strategy settlement confirmed',
    s.name||' settled at '||to_char(ret*100,'FM999990D00')||
      '%. Your position has been updated.',
    'settlement',
    jsonb_build_object(
      'strategy_id',s.id,
      'settlement_id',st.id,
      'return_pct',ret*100,
      'investor_value_before',beforev,
      'investor_value_after',afterv
    )
  from public.zynth_investments i
  where i.strategy_id=s.id and i.status='active';

  return jsonb_build_object(
    'settlement_id',st.id,
    'return_pct',ret*100,
    'nav',newnav,
    'investor_value_before',beforev,
    'investor_value_after',afterv,
    'strategy_trading_pnl',r.trading_pnl,
    'investor_pnl',afterv-beforev
  );
end;
$function$;

-- Repair derived investor values for settlements that were previously contaminated.
with settled as (
  select
    e.id,
    e.investment_id,
    e.nav,
    e.units,
    lag(e.nav) over (partition by e.investment_id order by e.created_at) as previous_nav
  from public.zynth_investment_events e
  where e.event_type='settled'
)
update public.zynth_investment_events e
set amount=round(
  e.units * (
    e.nav - coalesce(s.previous_nav, (
      select i.entry_nav from public.zynth_investments i where i.id=e.investment_id
    ))
  ),8
),
metadata=coalesce(e.metadata,'{}'::jsonb)||jsonb_build_object(
  'investor_delta',round(
    e.units * (
      e.nav - coalesce(s.previous_nav, (
        select i.entry_nav from public.zynth_investments i where i.id=e.investment_id
      ))
    ),8
  )
)
from settled s
where e.id=s.id;

update public.zynth_profit_lots l
set profit_amount=greatest(
  0,
  coalesce((
    select e.amount
    from public.zynth_investment_events e
    where e.event_type='settled'
      and e.metadata->>'settlement_id'=l.settlement_id::text
      and e.investment_id=l.investment_id
    order by e.created_at desc
    limit 1
  ),0)
)
where exists(
  select 1
  from public.zynth_investment_events e
  where e.event_type='settled'
    and e.metadata->>'settlement_id'=l.settlement_id::text
    and e.investment_id=l.investment_id
);

with totals as (
  select
    investment_id,
    coalesce(sum(greatest(amount,0)) filter(where event_type='settled'),0) as profit,
    coalesce(sum(greatest(-amount,0)) filter(where event_type='settled'),0) as loss
  from public.zynth_investment_events
  group by investment_id
)
update public.zynth_investments i
set realized_profit=t.profit,
    realized_loss=t.loss,
    updated_at=now()
from totals t
where i.id=t.investment_id;
