"use client";

import { useEffect, useState } from "react";

export default function AdminRegistrationSecurity() {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/admin/registration-security", { cache: "no-store" })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load Human Check.");
        if (active) setEnabled(data.settings?.human_check_enabled !== false);
      })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : "Could not load Human Check."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function toggle() {
    if (loading || saving || error) return;
    const next = !enabled;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/admin/registration-security", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ humanCheckEnabled: next }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save Human Check.");
      setEnabled(data.settings?.human_check_enabled === true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save Human Check.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-registration-security admin-registration-security-simple">
      <div className="admin-registration-simple-copy">
        <b>Human verification</b>
        <span>{loading ? "Loading…" : error ? "Setting unavailable" : enabled ? "On — people must complete Human Check to register." : "Off — registration works without Human Check."}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Human verification"
        className={`admin-human-check-switch ${enabled ? "is-on" : "is-off"}`}
        disabled={loading || saving || Boolean(error)}
        onClick={() => void toggle()}
      >
        <span className="admin-human-check-switch-knob" />
        <span className="admin-human-check-switch-label">{saving ? "Saving…" : enabled ? "ON" : "OFF"}</span>
      </button>
      {error && <p className="admin-registration-security-message">{error}</p>}
    </div>
  );
}
