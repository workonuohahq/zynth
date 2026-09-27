"use client";

import { useEffect, useState } from "react";
import { getPwaCredential, pwaFetch } from "@/lib/pwa/client";

export default function PwaWorkspaceGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    async function verify() {
      const token = getPwaCredential();
      if (!token) {
        window.location.replace("/install?next=" + encodeURIComponent(window.location.pathname));
        return;
      }
      try {
        const response = await pwaFetch("/api/pwa/validate", { cache: "no-store" });
        if (!response.ok) {
          window.location.replace("/install?next=" + encodeURIComponent(window.location.pathname));
          return;
        }
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) window.location.replace("/install?next=" + encodeURIComponent(window.location.pathname));
      }
    }
    verify();
    return () => { cancelled = true; };
  }, []);
  if (!ready) return <div className="pwa-workspace-loading" aria-live="polite"><span />Securing your ZYNTH workspace…</div>;
  return <>{children}</>;
}