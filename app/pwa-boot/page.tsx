"use client";

import { useEffect, useState } from "react";

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
}

export default function PwaBootPage() {
  const [message, setMessage] = useState("Preparing secure app access…");

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      if (!isStandalone()) {
        window.location.replace("/install");
        return;
      }
      try {
        const response = await fetch("/api/pwa/activate", { method: "POST", credentials: "include", cache: "no-store" });
        if (!response.ok) throw new Error("Activation failed");
        if (!cancelled) window.location.replace("/dashboard");
      } catch {
        if (!cancelled) setMessage("Unable to activate ZYNTH. Please reopen the installed app.");
      }
    }
    boot();
    return () => { cancelled = true; };
  }, []);

  return <main className="pwa-install-page"><section className="pwa-install-card"><div className="pwa-brand"><span className="pwa-brand-mark">Z</span><span>ZYNTH</span></div><div className="pwa-checking"><span /> {message}</div></section></main>;
}