"use client";

import { useEffect, useState } from "react";
import { isPwaStandalone, loadPwaCredential, pwaFetch } from "@/lib/pwa/client";

function installUrl() {
  return "/install?next=" + encodeURIComponent(window.location.pathname + window.location.search);
}

export default function PwaWorkspaceGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    async function verify() {
      // The credential alone is not enough. A normal browser must never be
      // treated as an installed-app workspace, even if storage is copied.
      if (!isPwaStandalone()) {
        window.location.replace(installUrl());
        return;
      }
      const token = await loadPwaCredential();
      if (!token) {
        window.location.replace(installUrl());
        return;
      }
      try {
        const response = await pwaFetch("/api/pwa/validate", { cache: "no-store" });
        if (!response.ok) {
          await import("@/lib/pwa/client").then(m => m.clearPwaCredential());
          window.location.replace(installUrl());
          return;
        }
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) window.location.replace(installUrl());
      }
    }
    verify();
    return () => { cancelled = true; };
  }, []);

  if (!ready) {
    return <div className="pwa-workspace-loading" aria-live="polite"><span />Securing your ZYNTH workspace…</div>;
  }
  return <>{children}</>;
}