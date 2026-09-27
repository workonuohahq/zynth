const STORAGE_KEY = "zynth_pwa_credential_v1";

export function getPwaCredential(): string | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(STORAGE_KEY); } catch { return null; }
}
export function setPwaCredential(token: string) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(STORAGE_KEY, token); } catch {}
}
export function clearPwaCredential() {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(STORAGE_KEY); } catch {}
}
export async function pwaFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = getPwaCredential();
  const headers = new Headers(init.headers || {});
  if (token) headers.set("x-zynth-pwa-token", token);
  return fetch(input, { ...init, headers, credentials: "include" });
}
