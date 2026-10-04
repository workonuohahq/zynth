"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Clock3,
  LogOut,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  TabletSmartphone,
  UserRound,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const SID = "zynth-security-session-id";

const fmt = (v: any) =>
  v
    ? new Date(v).toLocaleString("en-NG", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";

const icon = (t: string) =>
  t === "mobile" ? Smartphone : t === "tablet" ? TabletSmartphone : Monitor;

export default function SecurityPage() {
  const [data, setData] = useState<any>({
    devices: [],
    sessions: [],
    events: [],
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const supabase = createSupabaseBrowserClient();

  async function load() {
    setLoading(true);
    const { data: result, error } = await supabase.rpc(
      "zynth_security_center",
    );
    if (!error && result) setData(result);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function revoke(id: string) {
    setBusy(id);
    setMessage("");

    const response = await fetch("/api/security/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "revoke", sessionId: id }),
    });

    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.ok) {
      setMessage("We couldn't sign out that session. Please try again.");
    } else {
      await load();
    }

    setBusy(null);
  }

  async function revokeOthers() {
    const current = localStorage.getItem(SID) || "";

    if (!current) {
      setMessage(
        "This session is still being registered. Try again in a moment.",
      );
      return;
    }

    setBusy("all");

    const response = await fetch("/api/security/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "revoke_all",
        currentSessionId: current,
      }),
    });

    const result = await response.json().catch(() => null);
    const count = Number(result?.count || 0);

    setMessage(
      response.ok
        ? `${count} other session${count === 1 ? "" : "s"} signed out.`
        : "We couldn't sign out the other sessions.",
    );

    if (response.ok) await load();
    setBusy(null);
  }

  const currentId =
    typeof window !== "undefined" ? localStorage.getItem(SID) : null;

  return (
    <section className="dashboard-content security-page">
      <header className="dashboard-header premium-header">
        <div>
          <Link href="/dashboard" className="text-action">
            <ArrowLeft size={14} /> Back to dashboard
          </Link>
          <div className="eyebrow-row">
            <span className="eyebrow">ZYNTH / SECURITY CENTER</span>
            <span className="live-dot">
              <i /> PROTECTED
            </span>
          </div>
          <h1>Secure your account.</h1>
          <p>
            Review devices, active sessions and recent sign-in activity.
            Unknown access should be revoked immediately.
          </p>
        </div>
        <button
          className="fund-btn secondary-dark"
          onClick={load}
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? "spin" : ""} /> Refresh
        </button>
      </header>

      <div className="security-grid">
        <section className="panel security-hero">
          <div className="security-hero-icon">
            <ShieldCheck size={24} />
          </div>
          <div>
            <span className="muted">ACCOUNT SECURITY</span>
            <h2>Your access is monitored</h2>
            <p>
              ZYNTH records device and session activity so you can see where
              your account is being used.
            </p>
          </div>
        </section>

        <section className="panel security-actions">
          <div className="panel-head">
            <div>
              <span className="muted">SESSION CONTROL</span>
              <h2>Active sessions</h2>
            </div>
            <button
              className="danger-outline"
              onClick={revokeOthers}
              disabled={busy !== null}
            >
              <LogOut size={15} /> Sign out all other sessions
            </button>
          </div>

          {message && <div className="notice">{message}</div>}

          {loading ? (
            <div className="security-loading">
              <RefreshCw className="spin" size={18} /> Loading security
              activity…
            </div>
          ) : data.sessions.length ? (
            <div className="security-list">
              {data.sessions.map((s: any) => {
                const Device = icon(s.device_type);
                const current = s.id === currentId;

                return (
                  <article
                    className={"security-row " + (current ? "current" : "")}
                    key={s.id}
                  >
                    <span className="security-device-icon">
                      <Device size={19} />
                    </span>
                    <span className="security-row-copy">
                      <b>
                        {current
                          ? "Current device"
                          : s.device_type === "mobile"
                            ? "Mobile device"
                            : "Desktop browser"}
                      </b>
                      <small>
                        {s.browser_name || "Browser"} ·{" "}
                        {s.os_name || "Unknown OS"} ·{" "}
                        {s.ip_city ||
                          s.ip_region ||
                          "Location unavailable"}
                      </small>
                      <small>Last active {fmt(s.last_seen_at)}</small>
                    </span>

                    {current ? (
                      <span className="security-current">
                        <i /> Active now
                      </span>
                    ) : (
                      <button
                        className="danger-link"
                        onClick={() => revoke(s.id)}
                        disabled={busy !== null}
                      >
                        {busy === s.id ? "Signing out…" : "Sign out"}
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="security-empty">
              No active sessions recorded yet. Refresh in a moment.
            </div>
          )}
        </section>

        <section className="panel security-devices">
          <div className="panel-head">
            <div>
              <span className="muted">KNOWN DEVICES</span>
              <h2>Devices</h2>
            </div>
            <Smartphone size={19} />
          </div>

          {data.devices.length ? (
            <div className="security-list">
              {data.devices.map((d: any) => {
                const Device = icon(d.device_type);

                return (
                  <article className="security-row" key={d.id}>
                    <span className="security-device-icon">
                      <Device size={19} />
                    </span>
                    <span className="security-row-copy">
                      <b>{d.device_name || "ZYNTH device"}</b>
                      <small>
                        {d.browser_name || "Browser"} ·{" "}
                        {d.os_name || "Unknown OS"}
                      </small>
                      <small>
                        First seen {fmt(d.first_seen_at)} · Last active{" "}
                        {fmt(d.last_seen_at)}
                      </small>
                    </span>
                    <span className="security-current">
                      <i /> Known
                    </span>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="security-empty">No device history yet.</div>
          )}
        </section>

        <section className="panel security-events">
          <div className="panel-head">
            <div>
              <span className="muted">RECENT SECURITY ACTIVITY</span>
              <h2>Sign-in history</h2>
            </div>
            <Clock3 size={19} />
          </div>

          {data.events.length ? (
            <div className="security-list">
              {data.events.map((e: any) => (
                <article className="security-row" key={e.id}>
                  <span className="security-device-icon">
                    <UserRound size={18} />
                  </span>
                  <span className="security-row-copy">
                    <b>{String(e.event_type).replaceAll("_", " ")}</b>
                    <small>
                      {fmt(e.created_at)} ·{" "}
                      {e.ip_city || e.ip_region || "Location unavailable"}
                    </small>
                    <small>
                      {e.success ? "Successful" : "Unsuccessful"}
                      {e.failure_reason ? " · " + e.failure_reason : ""}
                    </small>
                  </span>
                  <span
                    className={
                      e.success ? "security-current" : "security-risk"
                    }
                  >
                    {e.success ? "OK" : "Review"}
                  </span>
                </article>
              ))}
            </div>
          ) : (
            <div className="security-empty">No recent security events.</div>
          )}
        </section>
      </div>
    </section>
  );
}
