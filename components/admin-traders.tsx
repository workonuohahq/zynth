"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ChevronRight, ExternalLink, Filter, KeyRound, Eye, EyeOff, ShieldAlert, ShieldCheck, UserPlus, Users, X, XCircle } from "lucide-react";

type Trader = any;

export default function AdminTraders({ onSaved, refreshKey }: { onSaved: () => void; refreshKey?: number }) {
  const [data, setData] = useState<any>({ traders: [], users: [], mt5_pending: [], mt5_pending_count: 0, reporting_settings:{trader_report_start_time:"06:00:00",trader_report_end_time:"23:00:00"} });
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [tab, setTab] = useState<"onboard" | "traders">("onboard");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revealedMt5, setRevealedMt5] = useState<any>(null);
  const [reportingForm, setReportingForm] = useState({startTime:"06:00",endTime:"23:00"});
  const [reportingBusy, setReportingBusy] = useState(false);

  async function load() {
    setLoading(true); setLoadError("");
    try {
      const r = await fetch("/api/admin/traders", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Unable to load trader operations.");
      const settings=j.reporting_settings||{trader_report_start_time:"06:00:00",trader_report_end_time:"23:00:00"};
      setData({ traders: Array.isArray(j.traders) ? j.traders : [], users: Array.isArray(j.users) ? j.users : [], mt5_pending: Array.isArray(j.mt5_pending) ? j.mt5_pending : [], mt5_pending_count: Number(j.mt5_pending_count || 0), reporting_settings:settings });
      setReportingForm({startTime:String(settings.trader_report_start_time||"06:00").slice(0,5),endTime:String(settings.trader_report_end_time||"23:00").slice(0,5)});
    } catch (e: any) { setLoadError(e?.message || "Unable to load trader operations."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [refreshKey]);

  async function openMt5Review(userId: string) {
    setBusy("mt5-review-"+userId);
    setRevealedMt5(null);
    try {
      const r = await fetch("/api/admin/traders?userId="+encodeURIComponent(userId), { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Unable to load this user's profile.");
      const p = j.profile || {};
      const traderProfile = j.trader || p;
      const trader = {
        id: p.id || userId,
        email: p.email,
        full_name: p.full_name,
        display_name: p.display_name,
        role: p.role,
        account_type: p.account_type,
        profile: traderProfile,
        mt5: j.credentials ? {
          mt5_login: j.credentials.mt5Login,
          mt5_server: j.credentials.mt5Server,
          status: j.credentials.status,
          submitted_at: j.credentials.submittedAt,
          verified_at: j.credentials.verifiedAt,
          rejection_reason: j.credentials.rejectionReason,
          change_requested: j.credentials.changeRequested
        } : null
      };
      setTab("traders");
      setSelected({ profile: traderProfile, trader, user: p });
    } catch (e: any) {
      window.alert(e?.message || "Unable to load trader profile.");
    } finally {
      setBusy("");
    }
  }

  async function saveReportingSettings(){
    setReportingBusy(true);
    try{
      const r=await fetch("/api/admin/traders",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"save_reporting_settings",...reportingForm})});
      const j=await r.json();
      if(!r.ok)throw new Error(j.error||"Unable to save reporting window.");
      setNote("Reporting window saved.");
      await load();
      onSaved();
    }catch(e:any){window.alert(e?.message||"Unable to save reporting window.");}
    finally{setReportingBusy(false);}
  }

  async function action(body: any, key: string) {
    setBusy(key);
    const r = await fetch("/api/admin/traders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) window.alert(j.error || "Operation failed");
    else window.alert(
      body.action === "promote"
        ? "User onboarded as trader."
        : "Operation completed."
    );
    await load();
    onSaved();
    setBusy("");
  }

  const stats = {
    active: data.traders.length,
    eligible: data.users.length,
    strategies: data.traders.reduce((n: number, t: Trader) => n + (t.strategy_count || 0), 0),
    mt5Pending: Number(data.mt5_pending_count || 0),
  };

  const profile = selected?.profile || selected;
  const mt5 = selected?.trader?.mt5 || (selected?.mt5 ? selected.mt5 : null);

  return (
    <section className="admin-section trader-command-center">
      <div className="trader-command-hero">
        <div>
          <div className="trader-command-kicker"><ShieldCheck size={12} /> TRADER OPERATIONS <i>COMMAND CENTER</i></div>
          <h2>Manage the people behind the strategies.</h2>
          <p>Review trader credentials, understand their risk profile, manage the approval pipeline, and monitor who is currently operating strategies on ZYNTH.</p>
        </div>
        <div className="trader-command-badge"><Users size={15} /><strong>{stats.active}</strong><span>active traders</span></div>
      </div>

      {loadError && <div className="trader-command-error"><ShieldAlert size={15}/><div><strong>Trader register unavailable</strong><span>{loadError}</span></div><button onClick={load}>Retry</button></div>}

      <section className="admin-card trader-reporting-settings-card">
        <div className="admin-card-head">
          <div><span className="muted">TRADER GOVERNANCE</span><h2>Daily reporting window</h2><p>Traders may submit one valuation report per strategy during this window. Open positions are allowed to carry forward across reporting cycles.</p></div>
          <span className="admin-count">1 report / cycle</span>
        </div>
        <div className="trader-reporting-settings-grid">
          <label><span>REPORTING OPENS</span><input type="time" value={reportingForm.startTime} onChange={e=>setReportingForm({...reportingForm,startTime:e.target.value})}/></label>
          <label><span>REPORTING CLOSES</span><input type="time" value={reportingForm.endTime} onChange={e=>setReportingForm({...reportingForm,endTime:e.target.value})}/></label>
          <div className="trader-reporting-rule"><ShieldCheck size={16}/><div><strong>Open positions remain valid</strong><small>Submitting a report no longer requires the trader to close every position. Unrealised P&L is carried into the next cycle.</small></div></div>
          <button className="approve trader-reporting-save" onClick={saveReportingSettings} disabled={reportingBusy}>{reportingBusy?"Saving…":"Save reporting rules"} <CheckCircle2 size={13}/></button>
        </div>
      </section>

      {stats.mt5Pending > 0 && <section className="admin-card trader-mt5-queue-card">
        <div className="trader-mt5-queue-head">
          <div className="trader-mt5-queue-title">
            <span className="muted">OPERATIONS · VERIFICATION</span>
            <div><h2>MT5 verification</h2><span className="trader-mt5-live"><i/> Attention required</span></div>
            <p>Review broker credentials before granting Trader Desk access. Pending submissions remain locked until an administrator makes a decision.</p>
          </div>
          <div className="trader-mt5-queue-summary"><strong>{stats.mt5Pending}</strong><span>Pending review</span><small>Trader Desk locked</small></div>
        </div>
        <div className="trader-mt5-table-head"><span>TRADER</span><span>MT5 ACCOUNT</span><span>SUBMITTED</span><span>STATUS</span><span></span></div>
        <div className="trader-mt5-queue-list">
          {data.mt5_pending.map((m:any) => {
            const trader = data.traders.find((t:any) => t.id === m.user_id);
            const queueUser = m.user || {};
            const queueProfile = m.profile || {};
            const name = queueProfile.display_name || queueProfile.full_name || queueUser.full_name || queueUser.email?.split("@")[0] || trader?.display_name || trader?.full_name || "User";
            const email = queueUser.email || trader?.email || "Email unavailable";
            const initials = String(name).trim().slice(0,1).toUpperCase() || "U";
            return <div key={m.user_id} className="trader-mt5-queue-item">
              <div className="trader-mt5-person"><div className="trader-avatar">{initials}</div><div><strong>{name}</strong><span>{email}</span></div></div>
              <div className="trader-mt5-account"><strong>{m.mt5_login || "—"}</strong><span>{m.mt5_server || "Server not supplied"}</span></div>
              <div className="trader-mt5-submitted"><strong>{m.submitted_at ? new Date(m.submitted_at).toLocaleDateString("en-NG",{day:"2-digit",month:"short",year:"numeric"}) : "—"}</strong><span>{m.submitted_at ? new Date(m.submitted_at).toLocaleTimeString("en-NG",{hour:"2-digit",minute:"2-digit"}) : ""}</span></div>
              <div><span className="trader-mt5-pending-badge"><i/> Pending</span></div>
              <div className="trader-mt5-row-actions">
                <button className="details" disabled={busy==="mt5-review-"+m.user_id} onClick={() => openMt5Review(m.user_id)}><Eye size={13}/>{busy==="mt5-review-"+m.user_id ? "Loading…" : "Review"}</button>
              </div>
            </div>
          })}
        </div>
      </section>}

      <div className="trader-command-stats">
        <div><span>ACTIVE TRADERS</span><strong>{stats.active}</strong><small>{stats.strategies} published strategies</small></div>
        <div><span>OPEN APPLICATIONS</span><strong>{stats.open}</strong><small>{stats.pending} awaiting first review</small></div>
        <div><span>IN REVIEW</span><strong>{stats.review}</strong><small>More info / under review</small></div>
        <div><span>APPROVAL PIPELINE</span><strong>{stats.pending + stats.review}</strong><small>Admin decisions required</small></div>
        <div><span>MT5 VERIFICATION</span><strong>{stats.mt5Pending}</strong><small>{stats.mt5Pending ? "Requires admin attention" : "Queue clear"}</small></div>
      </div>

      <div className="trader-command-tabs">
        <button className={tab === "onboard" ? "active" : ""} onClick={() => setTab("onboard")}>Onboard users <b>{stats.eligible}</b></button>
        <button className={tab === "traders" ? "active" : ""} onClick={() => setTab("traders")}>Active traders <b>{stats.active}</b></button>
      </div>

      {tab === "onboard" ? (
        <section className="admin-card trader-ops-card">
          <div className="admin-card-head">
            <div><span className="muted">CONTROLLED ONBOARDING</span><h2>Onboard a trader</h2><p>Only administrators can grant trader access. Users cannot submit trader applications or self-promote.</p></div>
            <span className="admin-count">{data.users.length} eligible</span>
          </div>
          <div className="trader-ops-toolbar">
            <label><Filter size={13}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search user or email…" /></label>
          </div>
          <div className="trader-promotion-grid">
            {data.users.filter((u:any)=>!query.trim() || [u.full_name,u.email].join(" ").toLowerCase().includes(query.toLowerCase().trim())).map((u:any)=>
              <div className="trader-promotion-row" key={u.id}>
                <div className="trader-avatar">{String(u.full_name||"U").slice(0,1).toUpperCase()}</div>
                <div><strong>{u.full_name||"Unnamed user"}</strong><span>{u.email}</span></div>
                <button className="details" disabled={busy===u.id} onClick={()=>action({action:"promote",userId:u.id},u.id)}><UserPlus size={13}/>{busy===u.id?"Onboarding…":"Onboard as trader"}</button>
              </div>
            )}
            {!data.users.length && <div className="admin-empty"><ShieldAlert size={22}/><p>No eligible active users found.</p></div>}
          </div>
          <div className="trader-review-note"><div><span>GOVERNANCE</span><p>Onboarding creates or activates the trader profile, records the administrator, and unlocks the Trader Desk. MT5 verification remains a separate operational gate.</p></div></div>
        </section>
      ) : (
        <section className="admin-card trader-ops-card">
          <div className="admin-card-head"><div><span className="muted">OPERATOR REGISTER</span><h2>Active traders</h2><p>Trader profiles, risk characteristics and strategy footprint.</p></div></div>
          <div className="trader-active-grid">
            {loading && <div className="admin-empty"><Users size={22}/><p>Loading the active trader register…</p></div>}
            {!loading && data.traders.map((t: Trader) => {
              const p = t.zynth_trader_profiles?.[0] || t.zynth_trader_profiles || {};
              return <article className="trader-active-card" key={t.id}>
                <div className="trader-card-top"><div className="trader-avatar-large">{String(t.display_name || "T").slice(0,1).toUpperCase()}</div><div className="trader-card-identity"><strong>{t.display_name || t.full_name || "Trader"}</strong><span>{t.email} · {p.country || "Country not supplied"}</span></div><span className="trader-status-pill approved">{p.status || "active"}</span></div>
                <div className="trader-card-tags">{(p.markets || []).slice(0,4).map((m:string)=><span key={m}>{m}</span>)}<span>{p.trading_style || "Style not supplied"}</span><span className={"trader-status-pill "+(t.mt5?.status==="verified"?"approved":t.mt5?.status==="rejected"?"rejected":"pending")}>MT5 {t.mt5?.status||"pending"}</span></div>
                <div className="trader-card-metrics"><div><span>EXPERIENCE</span><strong>{p.years_experience ?? "—"} yrs</strong></div><div><span>TYPICAL RISK</span><strong>{p.typical_risk_pct ?? "—"}%</strong></div><div><span>STRATEGIES</span><strong>{t.strategy_count || 0}</strong></div></div>
                <button className="details trader-view-button" onClick={()=>setSelected({profile:p, trader:t})}>Open trader profile <ChevronRight size={13}/></button>
              </article>
            })}
            {!loading && !data.traders.length && <div className="admin-empty"><Users size={22}/><p>No active traders yet.</p></div>}
          </div>
        </section>
      )}

      {selected && (
        <div className="trader-profile-backdrop" onClick={()=>setSelected(null)}>
          <aside className="trader-profile-drawer" onClick={e=>e.stopPropagation()}>
            <button className="trader-drawer-close" onClick={()=>setSelected(null)}><X size={16}/></button>
            <div className="trader-drawer-head">
              <div className="trader-avatar-large">{String(profile?.display_name || "T").slice(0,1).toUpperCase()}</div>
              <div><span>TRADER DUE DILIGENCE</span><h3>{profile?.display_name || "Trader profile"}</h3><p>{profile?.country || "Country not supplied"} · {profile?.broker_platform || "Platform not supplied"}</p></div>
            </div>
            <div className="trader-drawer-section"><span>PROFILE</span><p>{profile?.bio || "No biography supplied."}</p></div>
            <div className="trader-drawer-grid">
              <div><span>Experience</span><strong>{profile?.years_experience ?? "—"} years</strong></div>
              <div><span>Trading style</span><strong>{profile?.trading_style || "—"}</strong></div>
              <div><span>Holding period</span><strong>{profile?.holding_period || "—"}</strong></div>
              <div><span>Typical risk</span><strong>{profile?.typical_risk_pct ?? "—"}%</strong></div>
              <div><span>Historical max DD</span><strong>{profile?.historical_drawdown_pct ?? "—"}%</strong></div>
              <div><span>Markets</span><strong>{(profile?.markets || []).join(", ") || "—"}</strong></div>
            </div>
            <div className="trader-drawer-section"><span>RISK FRAMEWORK</span><p>{profile?.risk_management || "No risk framework supplied."}</p></div>
            <div className="trader-drawer-links">
              {profile?.track_record_url && <a href={profile.track_record_url} target="_blank" rel="noreferrer">Track record <ExternalLink size={12}/></a>}
            </div>
            {selected.trader && <div className="trader-mt5-admin-panel">
              <div className="trader-drawer-section"><span>MT5 ACCOUNT VERIFICATION</span><div className="trader-mt5-admin-grid">
                <div><span>Login</span><strong>{mt5?.mt5_login || "Not submitted"}</strong></div>
                <div><span>Server</span><strong>{mt5?.mt5_server || "Not submitted"}</strong></div>
                <div><span>Status</span><strong className={"trader-status-pill "+(mt5?.status==="verified"?"approved":mt5?.status==="rejected"?"rejected":"pending")}>{mt5?.status || "pending"}</strong></div>
              </div></div>
              {mt5 && mt5.status!=="verified" && <div className="trader-mt5-admin-actions">
                <button className="approve" disabled={busy==="mt5-verify"} onClick={()=>action({action:"verify_mt5",userId:selected.trader.id}, "mt5-verify")}><CheckCircle2 size={13}/> Verify MT5</button>
                <button className="reject" disabled={busy==="mt5-reject"} onClick={()=>action({action:"reject_mt5",userId:selected.trader.id,reason:note}, "mt5-reject")}><XCircle size={13}/> Reject</button>
                <button className="details" onClick={async()=>{const r=await fetch("/api/admin/traders?userId="+encodeURIComponent(selected.trader.id),{cache:"no-store"});const j=await r.json();if(r.ok)setRevealedMt5(j.credentials);else window.alert(j.error||"Unable to reveal credentials.");}}><KeyRound size={13}/> View credentials</button>
              </div>}
              {mt5?.status==="verified" && <div className="trader-mt5-admin-actions"><button className="details" onClick={async()=>{const r=await fetch("/api/admin/traders?userId="+encodeURIComponent(selected.trader.id),{cache:"no-store"});const j=await r.json();if(r.ok)setRevealedMt5(j.credentials);else window.alert(j.error||"Unable to load credentials.");}}><KeyRound size={13}/> View credentials</button></div>}
              {revealedMt5 && <div className="trader-mt5-secret"><div><span>MT5 login</span><b>{revealedMt5.mt5Login}</b></div><div><span>Server</span><b>{revealedMt5.mt5Server}</b></div><div><span>Investor password</span><b>{revealedMt5.investorPassword}</b><button onClick={()=>setRevealedMt5(null)} aria-label="Hide credentials">{revealedMt5?<EyeOff size={13}/>:<Eye size={13}/>}</button></div></div>}
            </div>}
          </aside>
        </div>
      )}
    </section>
  );
}