const STORAGE_KEY = "zynth-pwa-credential";
const TOKEN_HEADER = "x-zynth-pwa-token";

let memoryCredential: string | null = null;
let loadPromise: Promise<string | null> | null = null;

function hasStorage() {
  return typeof window !== "undefined" && "localStorage" in window;
}

export function isPwaStandalone() {
  if (typeof window === "undefined") return false;
  const standaloneMedia = window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  // Android WebAPK launches can expose an android-app:// referrer even when
  // a browser build reports display-mode inconsistently.
  const androidAppLaunch = document.referrer.startsWith("android-app://");
  return standaloneMedia || iosStandalone || androidAppLaunch;
}

export function getPwaCredential(): string | null {
  return memoryCredential;
}

export async function loadPwaCredential(): Promise<string | null> {
  if (memoryCredential) return memoryCredential;
  if (loadPromise) return loadPromise;
  loadPromise = Promise.resolve().then(() => {
    if (!hasStorage()) return null;
    try {
      const token = window.localStorage.getItem(STORAGE_KEY);
      memoryCredential = token;
      return token;
    } catch {
      return null;
    }
  }).finally(() => { loadPromise = null; });
  return loadPromise;
}

export async function setPwaCredential(token: string) {
  memoryCredential = token;
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, token);
  } catch {
    // The in-memory credential still protects the current app session.
  }
}

export async function clearPwaCredential() {
  memoryCredential = null;
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing else is required for sign-out.
  }
}

export async function pwaFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = await loadPwaCredential();
  const headers = new Headers(init.headers || {});
  if (token) headers.set(TOKEN_HEADER, token);
  return fetch(input, { ...init, headers, credentials: "include" });
}
