"use client";

import { useEffect } from "react";
import { getPwaCredential, loadPwaCredential } from "@/lib/pwa/client";

export default function PwaFetchBridge() {
  useEffect(() => {
    let active = true;
    const originalFetch = window.fetch.bind(window);

    // Install the interceptor immediately. Protected API calls may happen in
    // the same render cycle as this component; waiting to install the wrapper
    // until credential hydration completes creates a race and can yield a
    // false 403/PWA_REQUIRED response.
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? new URL(input, window.location.href)
          : input instanceof URL
            ? input
            : new URL(input.url, window.location.href);

      if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) {
        return originalFetch(input, init);
      }

      // Ensure sessionStorage credential hydration has completed before the
      // protected request is sent. The credential itself never leaves the
      // browser except as the dedicated PWA header.
      await loadPwaCredential();
      if (!active) return originalFetch(input, init);

      const headers = new Headers(
        init?.headers || (input instanceof Request ? input.headers : undefined)
      );
      const token = getPwaCredential();
      if (token) headers.set("x-zynth-pwa-token", token);

      return originalFetch(input, { ...(init || {}), headers });
    };

    return () => {
      active = false;
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}
