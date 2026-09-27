"use client";

import { useEffect } from "react";
import { loadPwaCredential } from "@/lib/pwa/client";

export default function PwaFetchBridge() {
  useEffect(() => {
    let active = true;
    const originalFetch = window.fetch.bind(window);
    void loadPwaCredential().then(() => {
      if (!active) return;
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? new URL(input, window.location.href) : input instanceof URL ? input : new URL(input.url, window.location.href);
        const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
        if (url.origin === window.location.origin && url.pathname.startsWith("/api/")) {
          const { getPwaCredential } = await import("@/lib/pwa/client");
          const token = getPwaCredential();
          if (token) headers.set("x-zynth-pwa-token", token);
        }
        return originalFetch(input, { ...(init || {}), headers });
      };
    });
    return () => {
      active = false;
      window.fetch = originalFetch;
    };
  }, []);
  return null;
}