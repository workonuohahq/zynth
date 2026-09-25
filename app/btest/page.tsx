"use client";

import { useState } from "react";

type Snapshot = { login?: string; server?: string; balance?: number; equity?: number; margin?: number; freeMargin?: number; marginLevel?: number | null; profit?: number; currency?: string; timestamp?: string };
type Position = Record<string, any>;

export default function BTestPage() {
  const [form, setForm] = useState({ login: "", password: "", server: "" });
  const [connectionId, setConnectionId] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [historyCount, setHistoryCount] = useState(0);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function connect() {
    setBusy(true); setError(""); setSnapshot(null); setStatus("Connecting to MTAPI…");
    try {
      const res = await fetch("/api/btest/connect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Connection failed");
      setConnectionId(data.connectionId); setSnapshot(data.snapshot); setStatus("Connected");
    } catch (e) { setStatus("Connection failed"); setError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setBusy(false); }
  }
  async function refresh() {
    if (!connectionId) return;
    setBusy(true); setError(""); setStatus("Refreshing MT5 data…");
    try {
      const res = await fetch("/api/btest/account", { cache: "no-store" }); const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Refresh failed");
      setSnapshot(data.snapshot); setPositions(Array.isArray(data.positions) ? data.positions : []); setHistoryCount(Array.isArray(data.history) ? data.history.length : 0); setStatus("Live data received");
    } catch (e) { setError(e instanceof Error ? e.message : "Refresh failed"); setStatus("Refresh failed"); }
    finally { setBusy(false); }
  }
  async function disconnect() {
    setBusy(true); await fetch("/api/btest/disconnect", { method: "POST" }).catch(() => {});
    setConnectionId(""); setSnapshot(null); setPositions([]); setHistoryCount(0); setStatus("Disconnected"); setBusy(false);
  }
  const money = (v?: number) => v == null ? "—" : v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const change = (key: keyof typeof form, value: string) => setForm(v => ({ ...v, [key]: value }));

  return <main className="btest">
    <div className="btest-top"><a href="/" className="btest-brand"><span>Z</span> ZYNTH / BTEST</a><span className={"btest-status " + (status === "Connected" || status === "Live data received" ? "ok" : "")}><i/> {status}</span></div>
    <section className="btest-hero"><div><p className="btest-eyebrow">MT5 CONNECTIVITY LAB</p><h1>Connect. Scan. <em>Measure.</em></h1><p className="btest-copy">A private test surface for ZYNTH&apos;s MT5 performance engine. This build uses MTAPI to connect a cloud-hosted MT5 session and read account data without a Windows VPS.</p></div><div className="btest-orb">MT5</div></section>
    <div className="btest-grid">
      <section className="btest-card">
        <div className="btest-card-head"><div><small>01 / CONNECTION</small><h2>Exness MT5 account</h2></div><span className="btest-readonly">READ-ONLY TEST</span></div>
        <p className="btest-note">Use an MT5 demo account. Enter the exact MT5 server name shown by your broker. Credentials are sent only to the server-side connector and are not stored in this test database.</p>
        <label>MT5 Login<input value={form.login} onChange={e=>change("login",e.target.value)} inputMode="numeric" placeholder="e.g. 12345678" autoComplete="off"/></label>
        <label>MT5 Server<input value={form.server} onChange={e=>change("server",e.target.value)} placeholder="e.g. Exness-MT5Trial..." autoComplete="off"/></label>
        <label>Password<input value={form.password} onChange={e=>change("password",e.target.value)} type="password" placeholder="MT5 investor/master password" autoComplete="off"/></label>
        <button className="btest-button" onClick={connect} disabled={busy || !form.login || !form.password || !form.server}>{busy ? "Connecting…" : "Connect & Pull Data"}</button>
        {error && <div className="btest-error">{error}</div>}
        <p className="btest-security">Never paste your MT5 password into ChatGPT. Enter it only into this secure test form.</p>
      </section>
      <section className="btest-card">
        <div className="btest-card-head"><div><small>02 / ACCOUNT SNAPSHOT</small><h2>Live account data</h2></div>{connectionId && <span className="btest-id">{connectionId.slice(0,8)}…</span>}</div>
        {!snapshot ? <div className="btest-empty"><strong>Waiting for connection</strong><span>Your first successful MT5 pull will appear here.</span></div> : <>
          <div className="btest-kpis"><div><span>Balance</span><strong>{money(snapshot.balance)} {snapshot.currency}</strong></div><div><span>Equity</span><strong>{money(snapshot.equity)} {snapshot.currency}</strong></div><div><span>Margin</span><strong>{money(snapshot.margin)} {snapshot.currency}</strong></div><div><span>Free margin</span><strong>{money(snapshot.freeMargin)} {snapshot.currency}</strong></div></div>
          <div className="btest-account"><span>LOGIN</span><b>{snapshot.login}</b><span>SERVER</span><b>{snapshot.server}</b><span>DAILY P/L</span><b>{money(snapshot.profit)} {snapshot.currency}</b></div>
          <div className="btest-actions"><button className="btest-button secondary" onClick={refresh} disabled={busy}>Refresh live data</button><button className="btest-button secondary" onClick={disconnect} disabled={busy}>Disconnect</button><span>Last pull {snapshot.timestamp ? new Date(snapshot.timestamp).toLocaleTimeString() : "—"}</span></div>
        </>}
      </section>
    </div>
    <section className="btest-card btest-performance">
      <div className="btest-card-head"><div><small>03 / DATA PIPELINE</small><h2>Trading data</h2></div><span className="btest-coming">CONNECTED</span></div>
      <div className="btest-performance-grid"><div><span>Open positions</span><strong>{positions.length}</strong><small>Read from MT5</small></div><div><span>History records</span><strong>{historyCount}</strong><small>Closed-order history returned by MTAPI</small></div><div><span>Performance engine</span><strong>READY</strong><small>Next: baseline + daily settlement</small></div></div>
      <p className="btest-note">The connector now proves account access, live account metrics, open positions and closed-order history. These snapshots are the raw inputs for ZYNTH&apos;s daily NAV and performance engine.</p>
    </section>
  </main>;
}
