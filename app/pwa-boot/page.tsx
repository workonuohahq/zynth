"use client";

import { useEffect, useState } from "react";
import { isPwaStandalone, setPwaCredential } from "@/lib/pwa/client";

function getNextPath() {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export default function PwaBootPage() {
  const [message, setMessage] = useState("Preparing secure app access…");
  useEffect(() => {
    let cancelled = false;
    async function boot() {
      if (!isPwaStandalone()) {
        window.location.replace("/install?next=" + encodeURIComponent(getNextPath()));
        return;
      }
      try {
        const response = await fetch("/api/pwa/activate", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "cache-control": "no-cache" }
        });
        if (!response.ok) throw new Error("Activation failed");
        const data = await response.json();
        if (!data.token) throw new Error("Credential missing");
        await setPwaCredential(data.token);
        if (!cancelled) window.location.replace(getNextPath());
      } catch {
        if (!cancelled) setMessage("Unable to activate ZYNTH. Please reopen the installed app.");
      }
    }
    boot();
    return () => { cancelled = true; };
  }, []);
  return <main className="pwa-install-page"><section className="pwa-install-card"><div className="pwa-brand"><span className="pwa-brand-mark">Z</span><span>ZYNTH</span></div><div className="pwa-checking"><span/>{message}</div></section></main>;
}