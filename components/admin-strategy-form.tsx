"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, CircleDollarSign, FileText, Plus, ShieldCheck, Sparkles, UserRound } from "lucide-react";

export default function AdminStrategyForm({ traders, onSaved }: { traders: any[]; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [traderId, setTraderId] = useState("");
  const [starting, setStarting] = useState("200000");
  const [minimum, setMinimum] = useState("5500");
  const [maximum, setMaximum] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedTrader = useMemo(
    () => traders.find((t) => t.id === traderId),
    [traders, traderId]
  );

  const money = (value: string) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return "—";
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0,
    }).format(n);
  };

  async function save() {
    setBusy(true);
    setMsg("");
    const r = await fetch("/api/admin/strategies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        description,
        traderId: traderId || null,
        startingBalance: Number(starting),
        minimumInvestment: Number(minimum),
        maximumInvestment: maximum ? Number(maximum) : null,
        status: "active",
      }),
    });
    const d = await r.json();
    setMsg(r.ok ? "Strategy published successfully." : "Error: " + (d.error || "Unable to create."));
    if (r.ok) {
      setName("");
      setDescription("");
      setTraderId("");
      onSaved();
    }
    setBusy(false);
  }

  return (
    <section className="admin-card strategy-publisher">
      <div className="strategy-publisher-head">
        <div>
          <div className="strategy-publisher-kicker">
            <span className="strategy-publisher-mark"><Sparkles size={12} /></span>
            <span>STRATEGY OPERATIONS</span>
            <i>ADMIN CONTROL</i>
          </div>
          <h2>Publish a strategy</h2>
          <p>Define the investment shell, assign its trader, and make the strategy available for controlled investor access.</p>
        </div>
        <div className="strategy-publisher-status">
          <span className="strategy-live-dot" />
          <strong>Ready to publish</strong>
          <small>Manual settlement enabled</small>
        </div>
      </div>

      <div className="strategy-publisher-layout">
        <div className="strategy-publisher-form">
          <div className="strategy-form-section">
            <div className="strategy-section-title">
              <div className="strategy-section-icon"><FileText size={15} /></div>
              <div>
                <span>01 · STRATEGY IDENTITY</span>
                <h3>Define the strategy</h3>
                <p>Give investors a clear name and operating description.</p>
              </div>
            </div>

            <div className="strategy-field-grid">
              <label className="strategy-field strategy-field-wide">
                <span>Strategy name <b>Required</b></span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. ZYNTH Alpha" />
                <small>Use a concise name that can remain consistent across investor statements.</small>
              </label>

              <label className="strategy-field strategy-field-wide">
                <span>Description</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the strategy's mandate, trading approach, and operating scope."
                />
                <small>Keep this factual. Performance is recorded separately through daily settlement.</small>
              </label>
            </div>
          </div>

          <div className="strategy-form-section">
            <div className="strategy-section-title">
              <div className="strategy-section-icon"><UserRound size={15} /></div>
              <div>
                <span>02 · STRATEGY OWNER</span>
                <h3>Assign a trader</h3>
                <p>Connect the strategy to the approved trader responsible for daily reporting.</p>
              </div>
            </div>

            <label className="strategy-field">
              <span>Responsible trader <b>Required</b></span>
              <select value={traderId} onChange={(e) => setTraderId(e.target.value)}>
                <option value="">Select an approved trader</option>
                {traders.map((t) => (
                  <option key={t.id} value={t.id}>{t.full_name || t.email}</option>
                ))}
              </select>
              <small>The trader will report daily closing balances and supporting evidence. Publishing does not allow the trader to change investor balances directly.</small>
            </label>

            {selectedTrader && (
              <div className="strategy-selected-trader">
                <div className="strategy-avatar"><UserRound size={15} /></div>
                <div>
                  <strong>{selectedTrader.full_name || "Approved trader"}</strong>
                  <span>{selectedTrader.email || "Trader profile selected"}</span>
                </div>
                <CheckCircle2 size={16} />
              </div>
            )}
          </div>

          <div className="strategy-form-section">
            <div className="strategy-section-title">
              <div className="strategy-section-icon"><CircleDollarSign size={15} /></div>
              <div>
                <span>03 · CAPITAL PARAMETERS</span>
                <h3>Set investment boundaries</h3>
                <p>These values establish the initial strategy capital and minimum investor entry.</p>
              </div>
            </div>

            <div className="strategy-field-grid strategy-money-grid">
              <label className="strategy-field">
                <span>Starting balance <b>Required</b></span>
                <div className="strategy-money-input"><em>₦</em><input type="number" min="0" value={starting} onChange={(e) => setStarting(e.target.value)} /></div>
                <small>Initial strategy operating balance.</small>
              </label>
              <label className="strategy-field">
                <span>Minimum investment <b>Required</b></span>
                <div className="strategy-money-input"><em>₦</em><input type="number" min="0" value={minimum} onChange={(e) => setMinimum(e.target.value)} /></div>
                <small>Minimum amount an investor may allocate.</small>
              </label>
            </div>

            <div className="strategy-capital-note">
              <ShieldCheck size={15} />
              <div>
                <strong>Controlled settlement</strong>
                <span>Investor returns are calculated from confirmed strategy NAV. Traders do not enter investor returns manually.</span>
              </div>
            </div>
          </div>

          <div className="strategy-publish-bar">
            <div>
              <span className="strategy-publish-label">FINAL CHECK</span>
              <strong>Ready to publish this strategy?</strong>
              <small>Publishing creates the strategy shell and makes it available according to the current investment settings.</small>
            </div>
            <button className="strategy-publish-button" onClick={save} disabled={busy || !name.trim() || !traderId || Number(starting) <= 0 || Number(minimum) <= 0 || (maximum !== "" && Number(maximum) < Number(minimum))}>
              {busy ? "Publishing…" : <><Plus size={15} /> Publish strategy</>}
            </button>
          </div>

          {msg && (
            <div className={"strategy-feedback " + (msg.startsWith("Error:") ? "is-error" : "is-success")}>
              {msg.startsWith("Error:") ? "!" : <CheckCircle2 size={15} />}
              <span>{msg}</span>
            </div>
          )}
        </div>

        <aside className="strategy-publisher-preview">
          <div className="strategy-preview-card">
            <span className="strategy-preview-kicker">LIVE PREVIEW</span>
            <div className="strategy-preview-title">
              <div className="strategy-preview-symbol">{name.trim() ? name.trim().slice(0, 1).toUpperCase() : "Z"}</div>
              <div>
                <strong>{name.trim() || "Your strategy"}</strong>
                <span>{selectedTrader?.full_name || "Trader not assigned"}</span>
              </div>
            </div>

            <div className="strategy-preview-metrics">
              <div><span>Starting balance</span><strong>{money(starting)}</strong></div>
              <div><span>Minimum entry</span><strong>{money(minimum)}</strong></div>\n              <div><span>Maximum entry</span><strong>{maximum ? money(maximum) : "No cap"}</strong></div>
            </div>

            <div className="strategy-preview-description">
              <span>INVESTOR DESCRIPTION</span>
              <p>{description.trim() || "Your strategy description will appear here once defined."}</p>
            </div>

            <div className="strategy-preview-status">
              <span className="strategy-live-dot" />
              <div><strong>Operational model</strong><small>Daily trader report · Admin confirmation · NAV settlement</small></div>
            </div>
          </div>

          <div className="strategy-publisher-note">
            <ShieldCheck size={15} />
            <div>
              <strong>Admin-controlled publishing</strong>
              <p>The strategy can be paused later without deleting its historical settlement or investor records.</p>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
