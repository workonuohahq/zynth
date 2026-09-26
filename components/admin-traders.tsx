"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, ExternalLink, Filter, ShieldAlert, ShieldCheck, UserPlus, Users, X, XCircle } from "lucide-react";

type Trader = any;
type Application = any;

export default function AdminTraders({ onSaved }: { onSaved: () => void }) {
  const [data, setData] = useState<any>({ traders: [], applications: [], users: [] });
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<any>(null);
  const [tab, setTab] = useState<"applications" | "traders">("applications");

  async function load() {
    const r = await fetch("/api/admin/traders", { cache: "no-store" });
    setData(await r.json());
  }
  useEffect(() => { load(); }, []);

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
      body.action === "approve"
        ? "Trader approved and Trader Desk unlocked."
        : body.action === "promote"
          ? "User promoted to trader."
          : "Application updated."
    );
    await load();
    onSaved();
    setBusy("");
  }

  const apps = useMemo(() => {
    const q = query.toLowerCase().trim();
    return data.applications.filter((a: Application) => {
      const hay = [a.display_name, a.email, a.country, a.trading_style, ...(a.markets || [])].join(" ").toLowerCase();
      return (!q || hay.includes(q)) && (status === "all" || a.status === status);
    });
  }, [data.applications, query, status]);

  const stats = {
    active: data.traders.length,
    open: data.applications.length,
    pending: data.applications.filter((a: Application) => a.status === "pending").length,
    review: data.applications.filter((a: Application) => ["under_review", "more_info"].includes(a.status)).length,
    strategies: data.traders.reduce((n: number, t: Trader) => n + (t.strategy_count || 0), 0),
  };

  const profile = selected?.profile || selected?.application || selected;

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

      <div className="trader-command-stats">
        <div><span>ACTIVE TRADERS</span><strong>{stats.active}</strong><small>{stats.strategies} published strategies</small></div>
        <div><span>OPEN APPLICATIONS</span><strong>{stats.open}</strong><small>{stats.pending} awaiting first review</small></div>
        <div><span>IN REVIEW</span><strong>{stats.review}</strong><small>More info / under review</small></div>
        <div><span>APPROVAL PIPELINE</span><strong>{stats.pending + stats.review}</strong><small>Admin decisions required</small></div>
      </div>

      <div className="trader-command-tabs">
        <button className={tab === "applications" ? "active" : ""} onClick={() => setTab("applications")}>Applications <b>{stats.open}</b></button>
        <button className={tab === "traders" ? "active" : ""} onClick={() => setTab("traders")}>Active traders <b>{stats.active}</b></button>
      </div>

      {tab === "applications" ? (
        <>
          <section className="admin-card trader-ops-card">
            <div className="admin-card-head">
              <div><span className="muted">REVIEW PIPELINE</span><h2>Trader applications</h2><p>Every application is a due-diligence record, not just an approval button.</p></div>
              <span className="admin-count">{apps.length} shown</span>
            </div>

            <div className="trader-ops-toolbar">
              <label><Filter size={13}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search trader, market, country…" /></label>
              <select value={status} onChange={e => setStatus(e.target.value)}>
                <option value="all">All statuses</option><option value="pending">Pending</option><option value="under_review">Under review</option><option value="more_info">More info</option>
              </select>
            </div>

            <div className="trader-application-grid">
              {apps.map((a: Application) => (
                <article className="trader-application-card" key={a.id}>
                  <div className="trader-card-top">
                    <div className="trader-avatar-large">{String(a.display_name || "A").slice(0,1).toUpperCase()}</div>
                    <div className="trader-card-identity"><strong>{a.display_name || "Unnamed trader"}</strong><span>{a.email || "No email"} · {a.country || "Country not supplied"}</span></div>
                    <span className={"trader-status-pill " + a.status}>{String(a.status).replaceAll("_"," ")}</span>
                  </div>
                  <div className="trader-card-tags">{(a.markets || []).slice(0,4).map((m: string) => <span key={m}>{m}</span>)}<span>{a.trading_style || "Style not supplied"}</span></div>
                  <div className="trader-card-metrics">
                    <div><span>EXPERIENCE</span><strong>{a.years_experience ?? 0} yrs</strong></div>
                    <div><span>TYPICAL RISK</span><strong>{a.typical_risk_pct ?? "—"}%</strong></div>
                    <div><span>MAX DD</span><strong>{a.historical_drawdown_pct ?? "—"}%</strong></div>
                  </div>
                  <div className="trader-card-actions">
                    <button className="details" onClick={() => setSelected({ application: a })}>Review profile <ChevronRight size={13}/></button>
                    <button className="approve" disabled={busy === a.id+"approve"} onClick={() => action({action:"approve",applicationId:a.id,note},a.id+"approve")}><CheckCircle2 size={13}/> Approve</button>
                    <button className="reject" disabled={busy === a.id+"reject"} onClick={() => action({action:"reject",applicationId:a.id,note},a.id+"reject")}><XCircle size={13}/></button>
                  </div>
                </article>
              ))}
              {!apps.length && <div className="admin-empty"><ShieldCheck size={22}/><p>No applications match the current filter.</p></div>}
            </div>

            <div className="trader-review-note">
              <div><span>ADMIN REVIEW NOTE</span><p>Use this note for the decision context. It stays separate from the trader's public profile.</p></div>
              <input value={note} onChange={e=>setNote(e.target.value)} placeholder="e.g. Track record verified; request broker statement before approval." />
            </div>
          </section>

          <section className="admin-card trader-promotion-card">
            <div className="admin-card-head"><div><span className="muted">DIRECT ACCESS</span><h2>Promote a user</h2><p>For controlled internal onboarding where an application is not required.</p></div></div>
            <div className="trader-promotion-grid">
              {data.users.map((u:any)=><div className="trader-promotion-row" key={u.id}><div className="trader-avatar">{String(u.full_name||"U").slice(0,1).toUpperCase()}</div><div><strong>{u.full_name||"Unnamed user"}</strong><span>{u.email}</span></div><button className="details" disabled={busy===u.id} onClick={()=>action({action:"promote",userId:u.id},u.id)}><UserPlus size={13}/>{busy===u.id?"Promoting…":"Promote"}</button></div>)}
              {!data.users.length && <div className="admin-empty"><ShieldAlert size={22}/><p>No eligible users found.</p></div>}
            </div>
          </section>
        </>
      ) : (
        <section className="admin-card trader-ops-card">
          <div className="admin-card-head"><div><span className="muted">OPERATOR REGISTER</span><h2>Active traders</h2><p>Trader profiles, risk characteristics and strategy footprint.</p></div></div>
          <div className="trader-active-grid">
            {data.traders.map((t: Trader) => {
              const p = t.zynth_trader_profiles?.[0] || t.zynth_trader_profiles || {};
              return <article className="trader-active-card" key={t.id}>
                <div className="trader-card-top"><div className="trader-avatar-large">{String(t.display_name || "T").slice(0,1).toUpperCase()}</div><div className="trader-card-identity"><strong>{t.display_name || t.full_name || "Trader"}</strong><span>{t.email} · {p.country || "Country not supplied"}</span></div><span className="trader-status-pill approved">{p.status || "active"}</span></div>
                <div className="trader-card-tags">{(p.markets || []).slice(0,4).map((m:string)=><span key={m}>{m}</span>)}<span>{p.trading_style || "Style not supplied"}</span></div>
                <div className="trader-card-metrics"><div><span>EXPERIENCE</span><strong>{p.years_experience ?? "—"} yrs</strong></div><div><span>TYPICAL RISK</span><strong>{p.typical_risk_pct ?? "—"}%</strong></div><div><span>STRATEGIES</span><strong>{t.strategy_count || 0}</strong></div></div>
                <button className="details trader-view-button" onClick={()=>setSelected({profile:p, trader:t})}>Open trader profile <ChevronRight size={13}/></button>
              </article>
            })}
            {!data.traders.length && <div className="admin-empty"><Users size={22}/><p>No active traders yet.</p></div>}
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
              {profile?.evidence_url && <a href={profile.evidence_url} target="_blank" rel="noreferrer">Evidence <ExternalLink size={12}/></a>}
            </div>
            {selected.application && <div className="trader-drawer-decision"><span>DECISION</span><div><button className="approve" onClick={()=>action({action:"approve",applicationId:selected.application.id,note},"drawer-approve")}><CheckCircle2 size={13}/> Approve trader</button><button className="details" onClick={()=>action({action:"more_info",applicationId:selected.application.id,note},"drawer-info")}>Request more info</button><button className="reject" onClick={()=>action({action:"reject",applicationId:selected.application.id,note},"drawer-reject")}><XCircle size={13}/> Reject</button></div></div>}
          </aside>
        </div>
      )}
    </section>
  );
}