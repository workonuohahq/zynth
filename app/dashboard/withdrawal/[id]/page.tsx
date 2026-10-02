"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Copy,
  Landmark,
  LoaderCircle,
  ShieldCheck,
  WalletCards,
  XCircle,
} from "lucide-react";

const naira = (n: number) =>
  `₦${Number(n || 0).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const labels: Record<string, string> = {
  pending: "Submitted",
  under_review: "Under review",
  processing: "Processing",
  paid: "Paid",
  rejected: "Rejected",
  cancelled: "Cancelled",
  failed: "Failed",
};

const descriptions: Record<string, string> = {
  pending: "Your withdrawal has been received and is waiting for an operations review.",
  under_review: "Your request is being checked before the payout is released.",
  processing: "Your payout has been approved and is being sent to your bank account.",
  paid: "Your payout has been marked as completed.",
  rejected: "This withdrawal was not approved. Review the reason below.",
  cancelled: "This withdrawal was cancelled and the reserved funds were returned.",
  failed: "The payout could not be completed. Review the reason below.",
};

export default function WithdrawalDetail({ params }: { params: { id: string } }) {
  const [w, setW] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = () =>
    fetch(`/api/withdrawals/${params.id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setW(d?.withdrawal || null))
      .catch(() => {});

  useEffect(() => {
    void load();
  }, []);

  async function cancel() {
    if (
      !confirm(
        "Cancel this withdrawal? The reserved gross amount will be returned to your available balance."
      )
    )
      return;

    setBusy(true);
    setMsg("");

    try {
      const r = await fetch("/api/withdrawals/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ withdrawalId: params.id }),
      });
      const d = await r.json();

      if (!r.ok) {
        setMsg(d.error || "Unable to cancel.");
        return;
      }

      setMsg(
        `${naira(Number(d.refunded || 0))} returned to your available balance.`
      );
      void load();
    } finally {
      setBusy(false);
    }
  }

  const steps = useMemo(
    () => [
      ["pending", "Submitted", w?.created_at],
      ["under_review", "Under review", w?.reviewed_at],
      ["processing", "Processing", w?.processing_at],
      ["paid", "Paid", w?.paid_at],
    ],
    [w]
  );

  if (!w) {
    return (
      <section className="dashboard-content withdrawal-detail-page">
        <Link href="/dashboard/transactions" className="text-action">
          <ArrowLeft size={14} /> Back to Activity
        </Link>
        <div className="panel withdrawal-loading">
          <LoaderCircle size={18} className="spin" />
          <span>Loading withdrawal details…</span>
        </div>
      </section>
    );
  }

  const terminal = ["rejected", "cancelled", "failed"].includes(w.status);
  const activeIndex = Math.max(
    0,
    steps.findIndex((s: any) => s[0] === w.status)
  );
  const sourceLabel =
    w.withdrawal_source === "combined"
      ? "All available balances"
      : w.withdrawal_source === "profit"
        ? "Vault Profit"
        : w.withdrawal_source === "zpa"
          ? "ZPA Earnings"
          : "Available Cash";

  return (
    <section className="dashboard-content withdrawal-detail-page">
      <header className="dashboard-header withdrawal-detail-header">
        <div>
          <div className="withdrawal-breadcrumb">
            <span className="eyebrow">ZYNTH / MONEY MOVEMENT</span>
            <span>Withdrawal tracking</span>
          </div>
          <h1>Track your withdrawal.</h1>
          <p>Follow the request from submission through final payout.</p>
        </div>

        <Link
          className="fund-btn secondary-dark"
          href="/dashboard/transactions"
        >
          <ArrowLeft size={16} /> Activity
        </Link>
      </header>

      <section className="withdrawal-status-hero">
        <div className="withdrawal-status-hero-main">
          <div className="withdrawal-status-kicker">
            <span className={`withdraw-status ${w.status}`}>
              {labels[w.status] || w.status}
            </span>
            <span className="withdrawal-live-indicator">
              <i /> Request ID {String(w.id).slice(0, 8)}
            </span>
          </div>

          <small className="withdrawal-hero-label">YOU RECEIVE</small>
          <strong>{naira(w.net_amount)}</strong>
          <p>{descriptions[w.status] || "Your withdrawal request is being tracked securely."}</p>
        </div>

        <div className="withdrawal-status-hero-meta">
          <div>
            <span>Requested</span>
            <b>
              {new Date(w.created_at).toLocaleString("en-NG", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </b>
          </div>
          <div>
            <span>Reference</span>
            <b className="mono">{w.reference}</b>
          </div>
        </div>
      </section>

      <div className="withdrawal-detail-grid">
        <section className="panel withdraw-detail-card withdrawal-progress-card">
          <div className="withdrawal-card-head">
            <div>
              <span className="muted">REQUEST PROGRESS</span>
              <h2>Withdrawal status</h2>
            </div>
            <span className="withdrawal-secure-badge">
              <ShieldCheck size={13} /> Secure
            </span>
          </div>

          <div className="withdrawal-progress-track">
            {steps.map((s: any, i: number) => {
              const done = Boolean(s[2]);
              const current = i === activeIndex && !terminal;
              return (
                <div
                  className={`withdrawal-progress-step ${done ? "done" : ""} ${current ? "current" : ""}`}
                  key={s[0]}
                >
                  <span className="withdrawal-progress-dot">
                    {done ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}
                  </span>
                  <div>
                    <b>{s[1]}</b>
                    <small>
                      {done
                        ? new Date(s[2]).toLocaleString("en-NG", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })
                        : "Awaiting update"}
                    </small>
                  </div>
                </div>
              );
            })}
          </div>

          {terminal && (
            <div className={`withdrawal-terminal ${w.status}`}>
              <XCircle size={17} />
              <div>
                <b>{labels[w.status]}</b>
                <small>
                  {w.failure_reason ||
                    "This withdrawal request is no longer active."}
                </small>
              </div>
            </div>
          )}

          <div className="withdrawal-next-note">
            <Clock3 size={15} />
            <div>
              <b>
                {terminal
                  ? "This request has reached its final state."
                  : "We’ll update this page as the request moves forward."}
              </b>
              <small>
                You can safely return to your dashboard. Your withdrawal
                reference remains available in Activity.
              </small>
            </div>
          </div>
        </section>

        <section className="panel withdraw-detail-card">
          <div className="withdrawal-card-head">
            <div>
              <span className="muted">PAYOUT DESTINATION</span>
              <h2>{w.bank_name}</h2>
            </div>
            <span className="withdrawal-card-icon">
              <Landmark size={17} />
            </span>
          </div>

          <div className="withdrawal-destination">
            <div className="withdrawal-destination-icon">
              <Landmark size={17} />
            </div>
            <div>
              <b>{w.account_name}</b>
              <span>•••• •••• {String(w.account_number).slice(-4)}</span>
              <small>Verified payout account</small>
            </div>
          </div>

          <div className="withdrawal-detail-list">
            <div>
              <span>Withdrawal source</span>
              <b>{sourceLabel}</b>
            </div>
            <div>
              <span>Gross withdrawal</span>
              <b>{naira(w.gross_amount)}</b>
            </div>
            <div>
              <span>Withdrawal fee</span>
              <b>−{naira(w.fee_amount)}</b>
            </div>
            <div className="emphasis">
              <span>Net payout</span>
              <b>{naira(w.net_amount)}</b>
            </div>
          </div>
        </section>

        <section className="panel withdraw-detail-card withdrawal-reference-card">
          <div className="withdrawal-card-head">
            <div>
              <span className="muted">WITHDRAWAL REFERENCE</span>
              <h2>Keep this reference</h2>
            </div>
            <WalletCards size={18} />
          </div>

          <div className="withdrawal-reference-box">
            <span className="mono">{w.reference}</span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(w.reference);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <p className="withdrawal-reference-help">
            Use this reference when contacting ZYNTH support about this
            withdrawal.
          </p>

          {msg && (
            <div className="form-feedback success">
              <CheckCircle2 size={15} /> {msg}
            </div>
          )}

          {w.status === "pending" && (
            <button
              className="danger-outline withdrawal-cancel-button"
              onClick={cancel}
              disabled={busy}
            >
              {busy ? "Cancelling…" : "Cancel withdrawal"}
              <ArrowUpRight size={14} />
            </button>
          )}
        </section>
      </div>
    </section>
  );
}
