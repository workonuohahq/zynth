"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  ShieldCheck,
  WalletCards,
  FileText,
  Download,
  TrendingUp,
  Clock3,
  Wallet,
  BadgeCheck,
} from "lucide-react";
import { pwaFetch } from "@/lib/pwa/client";

const money = (n: any) =>
  `₦${Number(n || 0).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function VaultPage() {
  const [s, setS] = useState<any>({});
  const [statements, setStatements] = useState<any[]>([]);
  const [statementType, setStatementType] = useState("monthly");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [statementBusy, setStatementBusy] = useState(false);
  const [statementMsg, setStatementMsg] = useState("");
  const [downloadBusy, setDownloadBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadVault() {
      const [summaryResult, statementsResult] = await Promise.allSettled([
        pwaFetch("/api/account/summary").then(async (response) => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(data.error || "Unable to load your Vault.");
          }
          return data;
        }),
        pwaFetch("/api/account/statements").then(async (response) => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(data.error || "Unable to load statements.");
          }
          return data;
        }),
      ]);

      if (cancelled) return;

      if (summaryResult.status === "fulfilled") {
        const data = summaryResult.value;
        const summary = data.summary || {};
        setS({
          ...summary,
          availableBalance: Number(
            data.withdrawableCash ?? data.available ?? summary.cash ?? 0,
          ),
          pendingRedemption: Number(summary.pending_redemptions || 0),
          pendingWithdrawal: Number(data.pendingWithdrawal || 0),
          hasZpa: data.hasZpa === true,
          zpaEarnings:
            data.hasZpa === true ? Number(data.zpaEarnings || 0) : 0,
        });
        setLoadError("");
      } else {
        setLoadError(
          summaryResult.reason instanceof Error
            ? summaryResult.reason.message
            : "Unable to load your Vault. Please refresh and try again.",
        );
      }

      if (statementsResult.status === "fulfilled") {
        setStatements(statementsResult.value.statements || []);
      }

      setLoading(false);
    }

    void loadVault();
    return () => {
      cancelled = true;
    };
  }, []);

  const vaultComposition = useMemo(() => {
    const items = [
      {
        key: "active-nav",
        label: "Active Strategy NAV",
        value: Math.max(0, Number(s.invested || 0)),
        color: "#d4af37",
        description: "Current value of active strategy positions",
      },
      {
        key: "available-balance",
        label: "Available Balance",
        value: Math.max(0, Number(s.availableBalance ?? s.cash ?? 0)),
        color: "#4e9b7c",
        description: "Cash currently available in your Vault",
      },
      {
        key: "pending-redemption",
        label: "Pending Redemption",
        value: Math.max(0, Number(s.pendingRedemption || 0)),
        color: "#6888bd",
        description: "Net proceeds awaiting redemption approval or release",
      },
      {
        key: "pending-withdrawal",
        label: "Pending Withdrawal",
        value: Math.max(0, Number(s.pendingWithdrawal || 0)),
        color: "#a779a6",
        description: "Net payout awaiting withdrawal completion",
      },
      ...(s.hasZpa
        ? [
            {
              key: "zpa-earnings",
              label: "ZPA Earnings",
              value: Math.max(0, Number(s.zpaEarnings || 0)),
              color: "#c18a58",
              description: "Available ZPA earnings, when assigned the role",
            },
          ]
        : []),
    ];

    const total = items.reduce((sum, item) => sum + item.value, 0);
    let cursor = 0;
    const gradientStops = items
      .filter((item) => item.value > 0)
      .map((item) => {
        const start = cursor;
        cursor += (item.value / (total || 1)) * 100;
        return `${item.color} ${start}% ${cursor}%`;
      });

    return {
      items: items.map((item) => ({
        ...item,
        percentage: total > 0 ? (item.value / total) * 100 : 0,
      })),
      total,
      gradient:
        total > 0
          ? `conic-gradient(${gradientStops.join(", ")})`
          : "conic-gradient(#343434 0% 100%)",
    };
  }, [s]);

  async function generateStatement() {
    setStatementBusy(true);
    setStatementMsg("");

    try {
      const r = await pwaFetch("/api/account/statements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ periodType: statementType, from, to }),
      });

      const d = await r.json();

      if (!r.ok) {
        setStatementMsg(d.error || "Unable to generate statement.");
        return;
      }

      setStatementMsg("Statement generated.");
      const x = await pwaFetch("/api/account/statements").then((res) =>
        res.json(),
      );
      setStatements(x.statements || []);
    } catch {
      setStatementMsg("Unable to generate statement. Please try again.");
    } finally {
      setStatementBusy(false);
    }
  }

  async function downloadStatement(
    id: string,
    periodStart: string,
    version: number,
  ) {
    setDownloadBusy(id);
    setStatementMsg("");

    try {
      const r = await pwaFetch(`/api/account/statements/${id}/pdf`, {
        method: "GET",
        cache: "no-store",
      });

      if (!r.ok) {
        const contentType = r.headers.get("content-type") || "";
        let message = "Statement PDF unavailable.";
        if (contentType.includes("application/json")) {
          const d = await r.json().catch(() => ({}));
          message = d.error || message;
        }
        throw new Error(message);
      }

      const blob = await r.blob();
      if (!blob.size) throw new Error("Statement PDF is empty.");

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ZYNTH-Vault-Statement-" + periodStart + "-v" + version + ".pdf";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);

      setStatementMsg("Statement PDF downloaded.");
    } catch (error: any) {
      setStatementMsg(error?.message || "Unable to download statement PDF.");
    } finally {
      setDownloadBusy(null);
    }
  }

  return (
    <section className="dashboard-content dashboard-spacing-page vault-page">
      <header className="dashboard-header">
        <div>
          <span className="eyebrow">ZYNTH / VAULT</span>
          <h1>Your Vault.</h1>
          <p>
            A clear view of your active investments, available cash and pending
            money movements.
          </p>
        </div>
        <div className="vault-header-actions">
          <Link className="fund-btn" href="/dashboard/investments">
            Manage positions <ArrowUpRight size={14} />
          </Link>
          <Link className="fund-btn secondary-dark" href="/dashboard">
            <ArrowLeft size={16} /> Overview
          </Link>
        </div>
      </header>

      {loadError && (
        <div className="vault-load-error" role="alert">
          <ShieldCheck size={16} />
          <span>{loadError}</span>
        </div>
      )}

      {loading ? (
        <div className="panel vault-loading">
          <span className="vault-loading-mark" />
          <span>Loading your secure Vault summary…</span>
        </div>
      ) : (
        <>
          <section className="vault-overview" aria-label="Vault summary">
            <div className="vault-primary">
              <div className="vault-primary-label">
                <span className="vault-kicker">ACTIVE STRATEGY NAV</span>
                <span className="vault-verified">
                  <ShieldCheck size={13} /> Confirmed valuation
                </span>
              </div>
              <strong>{money(s.invested)}</strong>
              <p>
                Current combined value of all your active strategy positions.
              </p>
              <div className="vault-nav-breakdown">
                <div>
                  <span>Principal</span>
                  <b>{money(s.principal)}</b>
                </div>
                <i />
                <div>
                  <span>Total profit</span>
                  <b>{money(s.profit)}</b>
                </div>
              </div>
            </div>

            <div className="vault-metrics">
              <article className="vault-metric">
                <span className="vault-metric-icon cash">
                  <Wallet size={16} />
                </span>
                <div>
                  <small>AVAILABLE BALANCE</small>
                  <strong>{money(s.availableBalance ?? s.cash)}</strong>
                  <em>Ready for withdrawal</em>
                </div>
              </article>
              <article className="vault-metric">
                <span className="vault-metric-icon redemption">
                  <TrendingUp size={16} />
                </span>
                <div>
                  <small>PENDING REDEMPTION</small>
                  <strong>{money(s.pendingRedemption)}</strong>
                  <em>Awaiting completion</em>
                </div>
              </article>
              <article className="vault-metric">
                <span className="vault-metric-icon withdrawal">
                  <Clock3 size={16} />
                </span>
                <div>
                  <small>PENDING WITHDRAWAL</small>
                  <strong>{money(s.pendingWithdrawal)}</strong>
                  <em>Net payout in progress</em>
                </div>
              </article>
              {s.hasZpa && (
                <article className="vault-metric">
                  <span className="vault-metric-icon zpa">
                    <BadgeCheck size={16} />
                  </span>
                  <div>
                    <small>ZPA EARNINGS</small>
                    <strong>{money(s.zpaEarnings)}</strong>
                    <em>Available ZPA earnings</em>
                  </div>
                </article>
              )}
            </div>
          </section>

          <section className="panel vault-composition-panel">
            <div className="panel-head">
              <div>
                <span className="muted">VAULT COMPOSITION</span>
                <h2>Where your money stands</h2>
                <p className="vault-panel-subtitle">
                  Your invested NAV, available funds and pending proceeds — without
                  counting the same money twice.
                </p>
              </div>
              <span className="admin-count">
                {vaultComposition.total ? money(vaultComposition.total) : "—"}
              </span>
            </div>

            {vaultComposition.total > 0 ? (
              <>
                <div className="vault-composition-grid">
                  <div
                    className="vault-donut"
                    role="img"
                    aria-label={
                      "Vault composition. Total position " +
                      money(vaultComposition.total)
                    }
                    style={{ background: vaultComposition.gradient }}
                  >
                    <div className="vault-donut-hole">
                      <span>TOTAL POSITION</span>
                      <strong>{money(vaultComposition.total)}</strong>
                      <small>Across all buckets</small>
                    </div>
                  </div>

                  <div className="vault-legend">
                    {vaultComposition.items.map((item) => (
                      <div className="vault-legend-row" key={item.key}>
                        <span
                          className="vault-legend-dot"
                          style={{ background: item.color }}
                          aria-hidden="true"
                        />
                        <div className="vault-legend-copy">
                          <b>{item.label}</b>
                          <small>{item.percentage.toFixed(1)}% of total position</small>
                        </div>
                        <strong>{money(item.value)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="vault-composition-note">
                  <ShieldCheck size={15} />
                  <p>
                    Principal and total profit are the internal breakdown of
                    Active Strategy NAV, shown above. They are not added again
                    to the composition total. Pending redemption and withdrawal
                    figures show net proceeds awaiting completion.
                  </p>
                </div>
              </>
            ) : (
              <div className="premium-empty">
                <WalletCards size={20} />
                <h3>No Vault composition yet</h3>
                <p>
                  Once your account has an active investment, available balance
                  or pending movement, this chart will show how your position is
                  distributed.
                </p>
                <Link className="primary" href="/dashboard/investments">
                  Explore strategies <ArrowUpRight size={15} />
                </Link>
              </div>
            )}
          </section>
        </>
      )}

      <section className="panel vault-statements-panel">
        <div className="panel-head">
          <div>
            <span className="muted">VAULT → STATEMENTS</span>
            <h2>Investor statements</h2>
          </div>
          <FileText size={18} />
        </div>

        <div className="statement-controls">
          <select
            value={statementType}
            onChange={(e) => setStatementType(e.target.value)}
          >
            <option value="monthly">Monthly</option>
            <option value="since_inception">Since inception</option>
            <option value="custom">Custom date range</option>
          </select>

          {statementType === "custom" && (
            <>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </>
          )}

          <button
            className="fund-btn"
            onClick={generateStatement}
            disabled={statementBusy}
          >
            {statementBusy ? "Generating…" : "Generate statement"}
          </button>
        </div>

        {statementMsg && (
          <p className="statement-message" role="status">
            {statementMsg}
          </p>
        )}

        <div className="statement-list">
          {statements.map((x) => (
            <div className="statement-row" key={x.id}>
              <span className="activity-icon neutral">
                <FileText size={16} />
              </span>

              <span className="activity-info">
                <b>
                  {x.period_start} — {x.period_end}
                </b>
                <small>
                  {String(x.period_type).replace("_", " ")} · Version{" "}
                  {x.version} · {x.status}
                </small>
              </span>

              <button
                className="text-action"
                onClick={() =>
                  downloadStatement(x.id, x.period_start, x.version)
                }
                disabled={downloadBusy === x.id}
                type="button"
                aria-label={"Download statement PDF for " + x.period_start}
              >
                <Download size={14} />
                {downloadBusy === x.id ? "PDF…" : "PDF"}
              </button>
            </div>
          ))}

          {!statements.length && (
            <div className="premium-empty">
              <FileText size={20} />
              <h3>No statements yet</h3>
              <p>
                Monthly statements are generated automatically at month close
                and custom statements can be generated here.
              </p>
            </div>
          )}
        </div>
      </section>

      <style jsx>{`
        .vault-header-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .vault-overview {
          display: grid;
          grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
          gap: 14px;
          margin-bottom: 14px;
        }
        .vault-primary {
          min-width: 0;
          padding: 25px;
          border: 1px solid rgba(212, 175, 55, .22);
          border-radius: 18px;
          background:
            radial-gradient(circle at 90% 0%, rgba(212,175,55,.11), transparent 38%),
            var(--dashboard-card, #111);
          box-shadow: 0 16px 38px rgba(0,0,0,.12);
        }
        .vault-primary-label {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .vault-kicker {
          color: var(--muted, #8a8a8a);
          font-size: 9px;
          font-weight: 800;
          letter-spacing: .14em;
        }
        .vault-verified {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: #b99b55;
          font-size: 9px;
        }
        .vault-primary>strong {
          display: block;
          margin-top: 18px;
          font-size: clamp(27px, 4vw, 39px);
          line-height: 1.12;
          letter-spacing: -.045em;
          overflow-wrap: anywhere;
        }
        .vault-primary>p {
          margin: 9px 0 0;
          color: var(--muted, #858585);
          font-size: 11px;
          line-height: 1.55;
        }
        .vault-nav-breakdown {
          display: flex;
          align-items: center;
          gap: 18px;
          margin-top: 24px;
          padding-top: 17px;
          border-top: 1px solid var(--line, rgba(255,255,255,.09));
        }
        .vault-nav-breakdown>div {
          display: grid;
          gap: 5px;
          min-width: 0;
        }
        .vault-nav-breakdown span {
          color: var(--muted, #858585);
          font-size: 9px;
        }
        .vault-nav-breakdown b {
          font-size: 13px;
          overflow-wrap: anywhere;
        }
        .vault-nav-breakdown>i {
          width: 1px;
          height: 28px;
          background: var(--line, rgba(255,255,255,.12));
        }
        .vault-metrics {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .vault-metric {
          display: flex;
          align-items: flex-start;
          gap: 11px;
          min-width: 0;
          padding: 17px 14px;
          border: 1px solid var(--line, rgba(255,255,255,.09));
          border-radius: 15px;
          background: var(--dashboard-card, #111);
        }
        .vault-metric-icon {
          display: grid;
          place-items: center;
          width: 32px;
          height: 32px;
          flex: 0 0 32px;
          border-radius: 10px;
        }
        .vault-metric-icon.cash { color: #69b993; background: rgba(78,155,124,.13); }
        .vault-metric-icon.redemption { color: #8ba9dc; background: rgba(104,136,189,.14); }
        .vault-metric-icon.withdrawal { color: #c49ac2; background: rgba(167,121,166,.14); }
        .vault-metric-icon.zpa { color: #d2a16d; background: rgba(193,138,88,.14); }
        .vault-metric>div {
          display: grid;
          gap: 5px;
          min-width: 0;
        }
        .vault-metric small {
          color: var(--muted, #858585);
          font-size: 8px;
          font-weight: 800;
          letter-spacing: .1em;
        }
        .vault-metric strong {
          font-size: clamp(12px, 1.35vw, 16px);
          line-height: 1.3;
          overflow-wrap: anywhere;
        }
        .vault-metric em {
          color: var(--muted, #777);
          font-size: 9px;
          font-style: normal;
        }
        .vault-composition-panel { overflow: hidden; }
        .vault-panel-subtitle {
          margin: 6px 0 0;
          color: var(--muted, #858585);
          font-size: 10px;
          line-height: 1.5;
        }
        .vault-composition-grid {
          display: grid;
          grid-template-columns: minmax(210px, .8fr) minmax(0, 1.2fr);
          align-items: center;
          gap: 28px;
          padding: 22px 4px 10px;
        }
        .vault-donut {
          position: relative;
          width: min(230px, 100%);
          aspect-ratio: 1;
          margin: 0 auto;
          border-radius: 50%;
          box-shadow: 0 0 0 1px rgba(212,175,55,.16), 0 18px 42px rgba(0,0,0,.2);
        }
        .vault-donut-hole {
          position: absolute;
          inset: 24%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          border: 1px solid rgba(255,255,255,.07);
          border-radius: 50%;
          background: var(--dashboard-card, #111);
          text-align: center;
          padding: 8px;
        }
        .vault-donut-hole span {
          color: var(--muted, #858585);
          font-size: 8px;
          font-weight: 800;
          letter-spacing: .1em;
        }
        .vault-donut-hole strong {
          max-width: 100%;
          font-size: clamp(12px, 2vw, 17px);
          line-height: 1.2;
          overflow-wrap: anywhere;
        }
        .vault-donut-hole small {
          color: var(--muted, #777);
          font-size: 8px;
        }
        .vault-legend {
          display: grid;
          gap: 0;
          min-width: 0;
        }
        .vault-legend-row {
          display: grid;
          grid-template-columns: 9px minmax(0, 1fr) minmax(0, auto);
          align-items: center;
          gap: 10px;
          min-width: 0;
          padding: 13px 0;
          border-bottom: 1px solid var(--line, rgba(255,255,255,.08));
        }
        .vault-legend-row:last-child { border-bottom: 0; }
        .vault-legend-dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
        }
        .vault-legend-copy {
          display: grid;
          gap: 4px;
          min-width: 0;
        }
        .vault-legend-copy b { font-size: 11px; }
        .vault-legend-copy small {
          color: var(--muted, #858585);
          font-size: 9px;
        }
        .vault-legend-row>strong {
          max-width: 100%;
          text-align: right;
          font-size: clamp(10px, 1.2vw, 14px);
          overflow-wrap: anywhere;
        }
        .vault-composition-note {
          display: flex;
          align-items: flex-start;
          gap: 9px;
          margin-top: 12px;
          padding: 12px 13px;
          border: 1px solid rgba(212,175,55,.16);
          border-radius: 11px;
          background: rgba(212,175,55,.045);
          color: #b99b55;
        }
        .vault-composition-note svg { flex: 0 0 auto; margin-top: 1px; }
        .vault-composition-note p {
          margin: 0;
          color: var(--muted, #969696);
          font-size: 9px;
          line-height: 1.65;
        }
        .vault-load-error {
          display: flex;
          align-items: center;
          gap: 9px;
          margin-bottom: 12px;
          padding: 12px 14px;
          border: 1px solid rgba(190,90,90,.3);
          border-radius: 11px;
          color: #dca0a0;
          font-size: 11px;
        }
        .vault-loading {
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 90px;
          color: var(--muted, #858585);
          font-size: 11px;
        }
        .vault-loading-mark {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #d4af37;
          box-shadow: 0 0 0 5px rgba(212,175,55,.1);
        }
        @media (max-width: 850px) {
          .vault-overview { grid-template-columns: 1fr; }
          .vault-composition-grid { grid-template-columns: minmax(170px, .7fr) minmax(0, 1.3fr); gap: 18px; }
        }
        @media (max-width: 620px) {
          .vault-header-actions { width: 100%; }
          .vault-header-actions .fund-btn { flex: 1; justify-content: center; }
          .vault-primary { padding: 20px; }
          .vault-composition-grid { grid-template-columns: 1fr; gap: 18px; }
          .vault-donut { width: min(205px, 78%); }
        }
        @media (max-width: 390px) {
          .vault-metrics { grid-template-columns: 1fr; }
          .vault-metric { padding: 14px; }
          .vault-nav-breakdown { gap: 12px; }
        }
      `}</style>
    </section>
  );
}
