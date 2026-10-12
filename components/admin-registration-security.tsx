"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, RefreshCw } from "lucide-react";

export default function AdminRegistrationSecurity() {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/registration-security", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not load security settings.");
      setEnabled(json.settings?.human_check_enabled !== false);
      setUpdatedAt(json.settings?.updated_at || "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load security settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function save(next: boolean) {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/registration-security", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ humanCheckEnabled: next }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not save security setting.");
      setEnabled(json.settings.human_check_enabled);
      setUpdatedAt(json.settings.updated_at || "");
      setMessage(next
        ? "Human Check enabled. New registrations must pass server verification."
        : "Human Check disabled. Registration rate limits remain active.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save security setting.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-registration-security">
      <div className="admin-card-head">
        <div>
          <span className="muted">REGISTRATION SECURITY</span>
          <h3>ZYNTH Human Check</h3>
          <p>Control the server-enforced human verification challenge used before new accounts are created.</p>
        </div>
        <ShieldCheck size={21} aria-hidden="true" />
      </div>
      <div className="admin-registration-security-row">
        <div className="admin-registration-security-status">
          <span className={enabled ? "admin-registration-security-icon is-enabled" : "admin-registration-security-icon"}>
            {enabled ? <ShieldCheck size={19} /> : <ShieldAlert size={19} />}
          </span>
          <div>
            <b>{loading ? "Checking setting…" : enabled ? "Human verification enabled" : "Human verification disabled"}</b>
            <small>{enabled ? "Valid, unused challenge required for signup." : "Signup continues with server-side rate limits."}</small>
          </div>
        </div>
        <div className="admin-registration-security-actions">
          <button className="ghost" onClick={() => void load()} disabled={loading || saving} aria-label="Refresh Human Check settings">
            <RefreshCw size={14} className={loading ? "spin" : ""} /> Refresh
          </button>
          <button className={enabled ? "reject" : "approve"} disabled={loading || saving} onClick={() => void save(!enabled)}>
            {saving ? "Saving…" : enabled ? "Disable Human Check" : "Enable Human Check"}
          </button>
        </div>
      </div>
      {message && <p role="status" className={message.includes("enabled") || message.includes("disabled") ? "admin-registration-security-message success" : "admin-registration-security-message"}>{message}</p>}
      {updatedAt && <small className="admin-registration-security-updated">Last changed {new Date(updatedAt).toLocaleString()}</small>}
      <div className="zt-warning admin-registration-security-note">
        Security rule: if the setting cannot be read, registration fails closed. Turning this off does not disable rate limiting or account security.
      </div>
    </div>
  );
}
