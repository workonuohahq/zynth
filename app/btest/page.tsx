"use client";

import { useState } from "react";

type Result = {
  nav?: number; returnPct?: number; grossPerformance?: number;
  investorValueBeforeFee?: number; performanceFee?: number; investorValueAfterFee?: number;
};

export default function BTestPage() {
  const [form, setForm] = useState({ login: "", server: "" });
  const [account, setAccount] = useState<any>(null);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [calc, setCalc] = useState({ previousNav: "1000", previousBalance: "10000", currentBalance: "10000", currentEquity: "10000", units: "0", entryNav: "1000", feePct: "0" });
  const [result, setResult] = useState<Result | null>(null);

  const change = (key: string, value: string) => setForm(v => ({ ...v, [key]: value }));
  const money = (v?: number) => v == null ? "—" : v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  async function registerAccount() {
    setBusy(true); setError(""); setStatus("Registering MT5 account…");
    try {
      const res = await fetch("/api/btest/connect", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Account setup failed");
      setAccount(data.account); setStatus("Account ready");
    } catch (e) {
      setStatus("Setup failed"); setError(e instanceof Error ? e.message : "Unknown error");
    } finally { setBusy(false); }
  }

  async function refresh() {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/btest/account", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Refresh failed");
      setAccount(data.account);
      if (data.snapshot) {
        setCalc(v => ({ ...v, currentBalance: String(data.snapshot.balance), currentEquity: String(data.snapshot.equity) }));
        setStatus("MT5 data received");
      } else {
        setStatus("Waiting for MT5 data bridge");
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Refresh failed"); setStatus("Refresh failed"); }
    finally { setBusy(false); }
  }

  async function disconnect() {
    setBusy(true);
    await fetch("/api/btest/disconnect", { method: "POST" }).catch(() => {});
    setAccount(null); setResult(null); setStatus("Disconnected"); setBusy(false);
  }

  async function calculate() {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/btest/calculate", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(calc)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Calculation failed");
      setResult(data); setStatus("NAV calculated");
    } catch (e) { setError(e instanceof Error ? e.message : "Calculation failed"); }
    finally { setBusy(false); }
  }

  return <main className="btest">
    <div className="btest-top">
      <a href="/dashboard" className="btest-brand"><span>Z</span> ZYNTH / BTEST</a>
      <span className="btest-status"><i/> {status}</span>
    </div>

    <section className="btest-hero">
      <div>
        <p className="btest-eyebrow">MT5 + INVESTMENT ENGINE</p>
        <h1>Connect. Calculate. <em>Settle.</em></h1>
        <p className="btest-copy">BTest is now provider-free. ZYNTH stores only the MT5 account identity and normalized performance data; the investment engine calculates NAV, units, returns and fees independently of the MT5 transport layer.</p>
      </div>
      <div className="btest-orb">NAV</div>
    </section>

    <div className="btest-grid">
      <section className="btest-card">
        <div className="btest-card-head"><div><small>01 / MT5 ACCOUNT</small><h2>Demo account</h2></div><span className="btest-readonly">ACCOUNT IDENTITY</span></div>
        <p className="btest-note">Enter the MT5 login and exact broker server. ZYNTH does not store an MT5 password. A terminal/bridge can later push the account's balance, equity and trade history into this same normalized model.</p>
        <label>MT5 Login<input value={form.login} onChange={e=>change("login",e.target.value)} inputMode="numeric" placeholder="e.g. 12345678"/></label>
        <label>MT5 Server<input value={form.server} onChange={e=>change("server",e.target.value)} placeholder="e.g. Exness-MT5Trial..."/></label>
        <button className="btest-button" onClick={registerAccount} disabled={busy || !form.login || !form.server}>{busy ? "Saving…" : "Use MT5 Account"}</button>
        {error && <div className="btest-error">{error}</div>}
      </section>

      <section className="btest-card">
        <div className="btest-card-head"><div><small>02 / DATA STATE</small><h2>Account feed</h2></div>{account && <span className="btest-id">{account.login}</span>}</div>
        {!account ? <div className="btest-empty"><strong>No MT5 account selected</strong><span>Register the demo account on the left.</span></div> : <>
          <div className="btest-account"><span>LOGIN</span><b>{account.login}</b><span>SERVER</span><b>{account.server}</b><span>STATUS</span><b>{account.status}</b></div>
          <div className="btest-actions"><button className="btest-button secondary" onClick={refresh} disabled={busy}>Refresh MT5 data</button><button className="btest-button secondary" onClick={disconnect} disabled={busy}>Disconnect</button></div>
          <p className="btest-note">The login is registered, but live MT5 values are intentionally not fabricated. Once a terminal bridge supplies a snapshot, Refresh will load it into the calculation engine.</p>
        </>}
      </section>
    </div>

    <section className="btest-card btest-performance">
      <div className="btest-card-head"><div><small>03 / NAV ENGINE</small><h2>Daily performance calculation</h2></div><span className="btest-coming">PROVIDER-FREE</span></div>
      <div className="btest-kpis">
        {[
          ["Previous NAV","previousNav"],["Previous balance","previousBalance"],["Current balance","currentBalance"],["Current equity","currentEquity"],["Investor units","units"],["Entry NAV","entryNav"],["Fee %","feePct"]
        ].map(([label,key]) => <div key={key}><span>{label}</span><input value={(calc as any)[key]} onChange={e=>setCalc(v=>({...v,[key]:e.target.value}))} inputMode="decimal"/></div>)}
      </div>
      <button className="btest-button" onClick={calculate} disabled={busy}>Calculate NAV</button>
      {result && <div className="btest-account">
        <span>NEW NAV</span><b>{money(result.nav)}</b>
        <span>DAILY RETURN</span><b>{result.returnPct == null ? "—" : (result.returnPct * 100).toFixed(4) + "%"}</b>
        <span>GROSS PERFORMANCE</span><b>{money(result.grossPerformance)}</b>
        <span>INVESTOR VALUE</span><b>{money(result.investorValueAfterFee)}</b>
      </div>}
      <p className="btest-note">The engine marks the strategy from MT5 equity, issues investor units at the current NAV, and supports performance fees above an investor's entry NAV. This calculation layer does not care which MT5 bridge supplies the data.</p>
    </section>
  </main>;
}
