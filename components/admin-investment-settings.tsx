"use client";

import { useEffect, useState } from "react";
import { LockKeyhole, Save, ShieldCheck } from "lucide-react";

type Settings = {
  investment_enabled: boolean;
  strategy_entry_enabled: boolean;
  strategy_exit_enabled: boolean;
  vault_profit_lock_days: number;
  global_min_deposit: number;
  global_min_withdrawal: number;
};

export default function AdminInvestmentSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/investment-settings")
      .then((r) => r.json())
      .then((d) => setSettings(d.settings))
      .catch(() => {});
  }, []);

  if (!settings) {
    return <div className="admin-empty"><ShieldCheck size={20} /><p>Loading financial controls…</p></div>;
  }

  async function save() {
    if (!settings) return;
    const current = settings;
    setBusy(true);
    setMessage("");
    const r = await fetch("/api/admin/investment-settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        investmentEnabled: current.investment_enabled,
        strategyEntryEnabled: current.strategy_entry_enabled,
        strategyExitEnabled: current.strategy_exit_enabled,
        vaultProfitLockDays: current.vault_profit_lock_days,
        minDeposit: current.global_min_deposit,
        minWithdrawal: current.global_min_withdrawal
      })
    });
    const d = await r.json();
    setMessage(r.ok ? "Financial rules saved and audited." : (d.error || "Save failed."));
    if (r.ok) setSettings((old) => old ? { ...old, ...d.settings } : old);
    setBusy(false);
  }

  return (
    <div>
      <div className="settings-grid">
        <label>
          <span>Profit lock period</span>
          <div className="setting-input">
            <input type="number" min="0" max="3650" value={settings.vault_profit_lock_days} onChange={(e) => setSettings({ ...settings, vault_profit_lock_days: Number(e.target.value) })} />
            <b>DAYS</b>
          </div>
        </label>
        <label>
          <span>Minimum deposit</span>
          <div className="setting-input">
            <input type="number" min="0" value={settings.global_min_deposit} onChange={(e) => setSettings({ ...settings, global_min_deposit: Number(e.target.value) })} />
            <b>NGN</b>
          </div>
        </label>
        <label>
          <span>Minimum withdrawal</span>
          <div className="setting-input">
            <input type="number" min="0" value={settings.global_min_withdrawal} onChange={(e) => setSettings({ ...settings, global_min_withdrawal: Number(e.target.value) })} />
            <b>NGN</b>
          </div>
        </label>
      </div>

      <label className="toggle-row">
        <span><b>Investment engine</b><small>Master switch. Keep disabled for BTest until operations and compliance are ready.</small></span>
        <input type="checkbox" checked={settings.investment_enabled} onChange={(e) => setSettings({ ...settings, investment_enabled: e.target.checked })} />
      </label>
      <label className="toggle-row">
        <span><b>Strategy entry</b><small>Allow investors to create new strategy positions.</small></span>
        <input type="checkbox" checked={settings.strategy_entry_enabled} onChange={(e) => setSettings({ ...settings, strategy_entry_enabled: e.target.checked })} />
      </label>
      <label className="toggle-row">
        <span><b>Strategy exit</b><small>Controls future investment redemption workflows.</small></span>
        <input type="checkbox" checked={settings.strategy_exit_enabled} onChange={(e) => setSettings({ ...settings, strategy_exit_enabled: e.target.checked })} />
      </label>

      <div className="notice"><LockKeyhole size={15} /> Profit lots generated after settlement use this lock period. Changing it does not rewrite already-created unlock dates.</div>
      <button className="primary save-settings" onClick={save} disabled={busy}>
        {busy ? "Saving…" : <><Save size={15} /> Save financial rules</>}
      </button>
      {message && <div className="form-feedback success">{message}</div>}
    </div>
  );
}