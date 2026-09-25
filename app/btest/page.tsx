"use client";

import { useState } from "react";

type Snapshot = {
  login?: string;
  name?: string;
  server?: string;
  platform?: string;
  balance?: number;
  equity?: number;
  credit?: number;
  margin?: number;
  freeMargin?: number;
  currency?: string;
  tradeMode?: string;
  timestamp?: string;
};

export default function BTestPage() {
  const [form, setForm] = useState({ login: "", password: "", server: "" });
  const [accountId, setAccountId] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function connect() {
    setBusy(true); setError(""); setSnapshot(null); setStatus("Connecting to MetaApi…");
    try {
      const res = await fetch("/api/btest/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Connection failed");
      setAccountId(data.accountId);
      setSnapshot(data.snapshot);
      setStatus("Connected");
    } catch (e) {
      setStatus("Connection failed");
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally { setBusy(false); }
  }

  async function refresh() {
    if (!accountId) return;
    setBusy(true); setError(""); setStatus("Refreshing account data…");
    try {
      const res = await fetch("/api/btest/account?accountId=" + encodeURIComponent(accountId), { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Refresh failed");
      setSnapshot(data.snapshot); setStatus("Live data received");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh failed"); setStatus("Refresh failed");
    } finally { setBusy(false); }
  }

  const change = (key: keyof typeof form, value: string) => setForm(v => ({ ...v, [key]: value }));

  return (
    <main className="btest">
      <div className="btest-top">
        <a href="/" className="btest-brand"><span>Z</span> ZYNTH / BTEST</a>
        <span className={"btest-status " + (status === "Connected" || status === "Live data received" ? "ok" : "")}><i/> {status}</span>
      </div>

      <section className="btest-hero">
        <div>
          <p className="btest-eyebrow">MT5 CLOUD CONNECTIVITY LAB</p>
          <h1>Connect. Scan. <em>Measure.</em></h1>
          <p className="btest-copy">A private test surface for ZYNTH&apos;s MT5 performance engine. This prototype uses MetaApi to connect a cloud-hosted MT5 terminal and read account data without a VPS.</p>
        </div>
        <div className="btest-orb">MT5</div>
      </section>

      <div className="btest-grid">
        <section className="btest-card">
          <div className="btest-card-head"><div><small>01 / CONNECTION</small><h2>Exness MT5 account</h2></div><span className="btest-readonly">READ-ONLY TEST</span></div>
          <p className="btest-note">Use an MT5 demo account. For a production version, ZYNTH should use a read-only/investor credential where supported. Credentials are sent only to the server-side connector and are not stored by this test page.</p>
          <label>MT5 Login<input value={form.login} onChange={e=>change("login",e.target.value)} inputMode="numeric" placeholder="e.g. 12345678"/></label>
          <label>MT5 Server<input value={form.server} onChange={e=>change("server",e.target.value)} placeholder="e.g. Exness-MT5Real..." /></label>
          <label>Password<input value={form.password} onChange={e=>change("password",e.target.value)} type="password" placeholder="MT5 investor/master password" /></label>
          <button className="btest-button" onClick={connect} disabled={busy || !form.login || !form.password || !form.server}>{busy ? "Connecting…" : "Connect & Pull Data"}</button>
          {error && <div className="btest-error">{error}</div>}
          <p className="btest-security">Never paste your MT5 password into ChatGPT. Enter it only into this secure test form.</p>
        </section>

        <section className="btest-card">
          <div className="btest-card-head"><div><small>02 / ACCOUNT SNAPSHOT</small><h2>Live account data</h2></div>{accountId && <span className="btest-id">{accountId.slice(0,8)}…</span>}</div>
          {!snapshot ? <div className="btest-empty"><strong>Waiting for connection</strong><span>Your first successful pull will appear here.</span></div> :
          <>
            <div className="btest-kpis">
              <div><span>Balance</span><strong>{snapshot.balance?.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})} {snapshot.currency}</strong></div>
              <div><span>Equity</span><strong>{snapshot.equity?.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})} {snapshot.currency}</strong></div>
              <div><span>Margin</span><strong>{snapshot.margin?.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})} {snapshot.currency}</strong></div>
              <div><span>Free margin</span><strong>{snapshot.freeMargin?.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})} {snapshot.currency}</strong></div>
            </div>
            <div className="btest-account"><span>LOGIN</span><b>{snapshot.login}</b><span>SERVER</span><b>{snapshot.server}</b><span>PLATFORM</span><b>{snapshot.platform?.toUpperCase()}</b></div>
            <div className="btest-actions"><button className="btest-button secondary" onClick={refresh} disabled={busy}>Refresh live data</button><span>Last pull {snapshot.timestamp ? new Date(snapshot.timestamp).toLocaleTimeString() : "—"}</span></div>
          </>}
        </section>
      </div>

      <section className="btest-card btest-performance">
        <div className="btest-card-head"><div><small>03 / ZYNTH ENGINE</small><h2>Daily performance</h2></div><span className="btest-coming">NEXT TEST</span></div>
        <div className="btest-performance-grid">
          <div><span>Today</span><strong>—</strong><small>Needs an end-of-day baseline</small></div>
          <div><span>Starting equity</span><strong>—</strong><small>Will be captured at settlement</small></div>
          <div><span>Daily P/L</span><strong>—</strong><small>Derived from account history</small></div>
        </div>
        <p className="btest-note">The first test proves the hardest part: ZYNTH can reach an MT5 account from the cloud. After that, we add a server-side baseline, daily snapshots, history/P&amp;L calculation and automated 00:00 settlement.</p>
      </section>
    </main>
  );
}
