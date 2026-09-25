import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  CalendarClock,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  LockKeyhole,
  Plus,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from "lucide-react";

const money = (value: unknown) =>
  `₦${Number(value || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const date = (value: string) =>
  new Date(value).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });

const daysLeft = (value: string) =>
  Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86400000));

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: profile }, { data: vaults }, { data: transactions }, { data: settings }] = await Promise.all([
    supabase.from("users").select("full_name,role,main_wallet_balance,locked_vault_balance,kyc_verified").eq("id", user!.id).single(),
    supabase.from("vaults").select("id,principal_amount,expected_yield,start_date,maturity_date,status").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(6),
    supabase.from("transactions").select("id,type,amount,status,created_at,reference").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(6),
    supabase.from("system_settings").select("global_min_deposit,current_yield_pct,exit_fee_pct,deposits_enabled").single(),
  ]);

  const activeVaults = (vaults || []).filter((v) => v.status === "active");
  const available = Number(profile?.main_wallet_balance || 0);
  const locked = Number(profile?.locked_vault_balance || 0);
  const totalPosition = available + locked;
  const expectedActiveYield = activeVaults.reduce((sum, v) => sum + Number(v.expected_yield || 0), 0);
  const name = profile?.full_name?.split(" ")[0] || "there";
  const latestVault = activeVaults[0];
  const verified = Boolean(profile?.kyc_verified);

  return (
    <section className="dashboard-content">
      <header className="dashboard-header premium-header">
        <div>
          <div className="eyebrow-row"><span className="eyebrow">PORTFOLIO OVERVIEW</span><span className="live-dot"><i /> LIVE ACCOUNT</span></div>
          <h1>Good morning, {name}.</h1>
          <p>Here is your ZYNTH position at a glance.</p>
        </div>
        <div className="header-actions">
          <Link className="icon-button" href="/dashboard/transactions" aria-label="View activity"><Clock3 size={17} /></Link>
          <Link className="fund-btn" href="/dashboard/vaults"><Plus size={17} /> Open a vault</Link>
        </div>
      </header>

      <section className="wealth-hero">
        <div className="wealth-main">
          <div className="wealth-label"><span>Total position</span><span className="secure-chip"><ShieldCheck size={13}/> Protected account</span></div>
          <strong>{money(totalPosition)}</strong>
          <div className="wealth-breakdown">
            <span><i className="dot available" /> Available {money(available)}</span>
            <span><i className="dot locked" /> In vaults {money(locked)}</span>
          </div>
        </div>
        <div className="wealth-side">
          <div><span>Active cycles</span><b>{activeVaults.length}</b></div>
          <div><span>Expected active yield</span><b>+{money(expectedActiveYield)}</b></div>
          <Link href="/dashboard/vaults">Manage portfolio <ArrowUpRight size={14}/></Link>
        </div>
      </section>

      <section className="quick-actions">
        <Link href="/dashboard/vaults" className="quick-action"><span className="qa-icon green"><LockKeyhole size={17}/></span><span><b>Open vault</b><small>Start a 5-day cycle</small></span><ChevronRight size={16}/></Link>
        <Link href="/dashboard/transactions" className="quick-action"><span className="qa-icon blue"><BarChart3 size={17}/></span><span><b>View activity</b><small>Track every movement</small></span><ChevronRight size={16}/></Link>
        <Link href="/dashboard/transactions" className="quick-action"><span className="qa-icon amber"><ArrowDownLeft size={17}/></span><span><b>Wallet history</b><small>Deposits & withdrawals</small></span><ChevronRight size={16}/></Link>
      </section>

      <div className="dashboard-grid">
        <section className="panel portfolio-panel">
          <div className="panel-head">
            <div><span className="muted">ACTIVE PORTFOLIO</span><h2>Your vaults</h2></div>
            <Link className="text-action" href="/dashboard/vaults">View all <ArrowUpRight size={14}/></Link>
          </div>
          {activeVaults.length ? (
            <div className="vault-cards">
              {activeVaults.map((v) => (
                <div className="vault-card" key={v.id}>
                  <div className="vault-card-top"><span className="status-badge"><i/> ACTIVE</span><span>{daysLeft(v.maturity_date)} days left</span></div>
                  <div className="vault-card-amount">{money(v.principal_amount)}</div>
                  <div className="vault-progress"><span style={{ width: `${Math.min(100, Math.max(6, 100 - (daysLeft(v.maturity_date) / 5) * 100))}%` }} /></div>
                  <div className="vault-card-meta"><span>Matures <b>{date(v.maturity_date)}</b></span><span>Yield <b>+{money(v.expected_yield)}</b></span></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="premium-empty"><div className="empty-icon"><Sparkles size={21}/></div><h3>Build your first position</h3><p>Move available funds into a 5-day vault and track the cycle from this dashboard.</p><Link className="primary" href="/dashboard/vaults">Open your first vault <ArrowUpRight size={15}/></Link></div>
          )}
        </section>

        <aside className="dashboard-stack">
          <section className="panel account-panel">
            <div className="panel-head"><div><span className="muted">ACCOUNT STATUS</span><h2>Account health</h2></div><ShieldCheck className="health-icon" size={19}/></div>
            <div className="health-row"><span>Email & authentication</span><b className="ok">Verified</b></div>
            <div className="health-row"><span>Account protection</span><b className="ok">Active</b></div>
            <div className="health-row"><span>Identity verification</span><b className={verified ? "ok" : "pending"}>{verified ? "Verified" : "Pending"}</b></div>
            {!verified && <div className="notice">Complete verification when required before restricted account actions.</div>}
          </section>
          <section className="panel next-panel">
            <div className="panel-head"><div><span className="muted">NEXT MILESTONE</span><h2>{latestVault ? "Vault maturity" : "Get started"}</h2></div><CalendarClock size={18}/></div>
            {latestVault ? <><div className="milestone-value">{date(latestVault.maturity_date)}</div><p>Expected payout: <b>{money(Number(latestVault.principal_amount) + Number(latestVault.expected_yield))}</b></p><Link className="text-action" href="/dashboard/vaults">View cycle details <ArrowUpRight size={14}/></Link></> : <><p className="copy">Your first 5-day cycle will appear here with its maturity date and expected payout.</p><Link className="text-action" href="/dashboard/vaults">Explore vaults <ArrowUpRight size={14}/></Link></>}
          </section>
        </aside>
      </div>

      <section className="panel activity-panel">
        <div className="panel-head"><div><span className="muted">RECENT ACTIVITY</span><h2>Latest movements</h2></div><Link className="text-action" href="/dashboard/transactions">Full activity <ArrowUpRight size={14}/></Link></div>
        {transactions?.length ? <div className="activity-list">{transactions.slice(0,5).map((tx) => {
          const positive = ["deposit","cycle_payout","zpa_commission"].includes(tx.type);
          return <div className="activity-row" key={tx.id}><span className={`activity-icon ${positive ? "positive" : "neutral"}`}>{positive ? <ArrowDownLeft size={16}/> : <ArrowUpRight size={16}/>}</span><span className="activity-info"><b>{tx.type.replaceAll("_"," ")}</b><small>{date(tx.created_at)} · {tx.status}</small></span><strong className={positive ? "amount-positive" : ""}>{positive ? "+" : "-"}{money(tx.amount)}</strong></div>;
        })}</div> : <div className="activity-empty"><CircleDollarSign size={18}/><span>No account activity yet.</span></div>}
      </section>

      <footer className="dashboard-footnote">
        <span>Minimum vault deposit: {money(settings?.global_min_deposit || 0)}</span>
        <span>Configured yield: {Number(settings?.current_yield_pct || 0)}%</span>
        <span>Exit fee: {Number(settings?.exit_fee_pct || 0)}%</span>
      </footer>
    </section>
  );
}
