const STORAGE_DB = "zynth-pwa";
const STORAGE_STORE = "credentials";
const STORAGE_KEY = "device";
const TOKEN_HEADER = "x-zynth-pwa-token";

let memoryCredential: string | null = null;
let loadPromise: Promise<string | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) return Promise.resolve(null);
  return new Promise(resolve => {
    try {
      const request = indexedDB.open(STORAGE_DB, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORAGE_STORE)) db.createObjectStore(STORAGE_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

export function isPwaStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function getPwaCredential(): string | null {
  return memoryCredential;
}

export async function loadPwaCredential(): Promise<string | null> {
  if (memoryCredential) return memoryCredential;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const db = await openDb();
    if (!db) return null;
    try {
      const token = await new Promise<string | null>(resolve => {
        const tx = db.transaction(STORAGE_STORE, "readonly");
        const request = tx.objectStore(STORAGE_STORE).get(STORAGE_KEY);
        request.onsuccess = () => resolve(typeof request.result === "string" ? request.result : null);
        request.onerror = () => resolve(null);
      });
      memoryCredential = token;
      return token;
    } finally {
      db.close();
    }
  })().finally(() => { loadPromise = null; });
  return loadPromise;
}

export async function setPwaCredential(token: string) {
  memoryCredential = token;
  const db = await openDb();
  if (!db) return;
  try {
    await new Promise<void>(resolve => {
      const tx = db.transaction(STORAGE_STORE, "readwrite");
      tx.objectStore(STORAGE_STORE).put(token, STORAGE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } finally { db.close(); }
}

export async function clearPwaCredential() {
  memoryCredential = null;
  const db = await openDb();
  if (!db) return;
  try {
    await new Promise<void>(resolve => {
      const tx = db.transaction(STORAGE_STORE, "readwrite");
      tx.objectStore(STORAGE_STORE).delete(STORAGE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } finally { db.close(); }
}

export async function pwaFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = await loadPwaCredential();
  const headers = new Headers(init.headers || {});
  if (token) headers.set(TOKEN_HEADER, token);
  return fetch(input, { ...init, headers, credentials: "include" });
}
