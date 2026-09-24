"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, ChevronRight, LockKeyhole, ShieldCheck, WalletCards, Zap } from "lucide-react";

const stats = [
  { label: "Available balance", value: "₦0.00", icon: WalletCards },
  { label: "Locked in vaults", value: "₦0.00", icon: LockKeyhole },
  { label: "Next maturity", value: "—", icon: Zap }
];

export default function Home() {
  const [active, setActive] = useState("Overview");
  const nav = ["Overview", "Vaults", "Transactions", "Profile"];

  const headline = useMemo(() => active === "Overview" ? "Build wealth in focused cycles." : active, [active]);

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">Z</span><span>ZYNTH</span></div>
        <div className="side-label">PERSONAL</div>
        <nav>{nav.map(item => (
          <button key={item} className={active === item ? "nav-item active" : "nav-item"} onClick={() => setActive(item)}>
            {item}<ChevronRight size={15} />
          </button>
        ))}</nav>
        <div className="side-bottom">
          <div className="secure"><ShieldCheck size={16} /><span>Protected session</span></div>
          <button className="profile-mini"><span className="avatar">U</span><span><b>My account</b><small>Standard user</small></span></button>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div><span className="eyebrow">ZYNTH / {active.toUpperCase()}</span><h1>{headline}</h1></div>
          <button className="fund-btn">Fund wallet <ArrowUpRight size={16} /></button>
        </header>

        {active === "Overview" ? (
          <>
            <section className="hero-card">
              <div><span className="muted">TOTAL PORTFOLIO</span><strong>₦0.00</strong><p>Start with the minimum deposit and create your first 5-day vault.</p></div>
              <div className="hero-orb">Z</div>
            </section>
            <section className="stats">{stats.map(({label,value,icon:Icon}) => <div className="stat" key={label}><div className="stat-icon"><Icon size={18}/></div><span>{label}</span><b>{value}</b></div>)}</section>
            <section className="grid-2">
              <div className="panel"><div className="panel-head"><div><span className="muted">5-DAY YIELD VAULT</span><h2>Put idle cash to work.</h2></div><span className="pill">MIN ₦5,500</span></div><p className="copy">Choose an amount from your available wallet balance, lock it for the active cycle, and track maturity from one place.</p><button className="primary" onClick={() => setActive("Vaults")}>Open vault <ArrowUpRight size={16}/></button></div>
              <div className="panel dark"><span className="muted">NETWORK</span><h2>ZPA</h2><p className="copy">Know a ZYNTH Prime Agent? Your referral is attached to your account at activation.</p><button className="ghost">Learn about ZPA <ChevronRight size={16}/></button></div>
            </section>
          </>
        ) : (
          <section className="empty-panel"><div className="empty-icon">Z</div><h2>{active}</h2><p>This portal module is being connected to the live Supabase data layer.</p></section>
        )}
      </section>
    </main>
  );
}