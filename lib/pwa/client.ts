const STORAGE_KEY = "zynth_pwa_credential_v1";

function storage() {
  if (typeof window === "undefined") return null;
  try { return window.sessionStorage; } catch { return null; }
}
export function getPwaCredential(): string | null {
  try { return storage()?.getItem(STORAGE_KEY) || null; } catch { return null; }
}
export function setPwaCredential(token: string) {
  try { storage()?.setItem(STORAGE_KEY, token); } catch {}
}
export function clearPwaCredential() {
  try { storage()?.removeItem(STORAGE_KEY); } catch {}
}
export async function pwaFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = getPwaCredential();
  const headers = new Headers(init.headers || {});
  if (token) headers.set("x-zynth-pwa-token", token);
  return fetch(input, { ...init, headers, credentials: "include" });
}