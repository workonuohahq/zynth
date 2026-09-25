export type NormalizedAccount = {
  providerAccountId: string;
  login: string;
  server: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number | null;
  profit: number;
  credit: number;
  leverage: number | null;
  currency: string;
};

export type NormalizedPosition = {
  providerPositionId: string | null;
  symbol: string | null;
  side: string | null;
  volume: number | null;
  openPrice: number | null;
  currentPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  profit: number;
  swap: number;
  openedAt: string | null;
  raw: Record<string, unknown>;
};

const BASE = (process.env.MT5API_BASE_URL || "https://api.mt5api.dev").replace(/\/$/, "");

function key() {
  const value = process.env.MT5API_API_KEY;
  if (!value) throw new Error("MT5API is not configured on the server.");
  return value;
}

async function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${key()}`);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(BASE + path, { ...init, headers, cache: "no-store" });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
  if (!response.ok) {
    const message = data?.error?.message || data?.message || data?.error || `MT5API request failed (${response.status})`;
    throw new Error(String(message).slice(0, 500));
  }
  return data;
}

export async function connectMT5(input: { login: string; password: string; server: string }) {
  return request("/v1/accounts", {
    method: "POST",
    body: JSON.stringify({ login: Number(input.login), password: input.password, server: input.server })
  });
}

export async function getMT5Account(accountId: string) {
  return request(`/v1/accounts/${encodeURIComponent(accountId)}`);
}

export async function getMT5Positions(accountId: string) {
  const data = await request(`/v1/accounts/${encodeURIComponent(accountId)}/positions`);
  return Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : Array.isArray(data?.positions) ? data.positions : [];
}

export async function disconnectMT5(accountId: string) {
  try {
    await request(`/v1/accounts/${encodeURIComponent(accountId)}`, { method: "DELETE" });
  } catch (error) {
    // The upstream account may already be disconnected; local state is still cleared.
    if (!(error instanceof Error) || !/not found|already|404/i.test(error.message)) throw error;
  }
}

export function normalizeAccount(raw: any, fallback: { login: string; server: string; providerAccountId: string }): NormalizedAccount {
  const a = raw?.data ?? raw?.account ?? raw;
  return {
    providerAccountId: String(a?.id ?? fallback.providerAccountId),
    login: String(a?.login ?? fallback.login),
    server: String(a?.server ?? fallback.server),
    balance: Number(a?.balance ?? 0),
    equity: Number(a?.equity ?? 0),
    margin: Number(a?.margin ?? 0),
    freeMargin: Number(a?.free_margin ?? a?.freeMargin ?? 0),
    marginLevel: a?.margin_level == null && a?.marginLevel == null ? null : Number(a?.margin_level ?? a?.marginLevel),
    profit: Number(a?.profit ?? a?.today_profit ?? 0),
    credit: Number(a?.credit ?? 0),
    leverage: a?.leverage == null ? null : Number(a.leverage),
    currency: String(a?.currency ?? "")
  };
}

export function normalizePosition(raw: any): NormalizedPosition {
  const p = raw?.data ?? raw;
  return {
    providerPositionId: p?.id == null && p?.ticket == null ? null : String(p.id ?? p.ticket),
    symbol: p?.symbol == null ? null : String(p.symbol),
    side: p?.side == null && p?.type == null ? null : String(p.side ?? p.type),
    volume: p?.volume == null ? null : Number(p.volume),
    openPrice: p?.open_price == null && p?.openPrice == null ? null : Number(p.open_price ?? p.openPrice),
    currentPrice: p?.current_price == null && p?.currentPrice == null ? null : Number(p.current_price ?? p.currentPrice),
    stopLoss: p?.stop_loss == null && p?.stopLoss == null ? null : Number(p.stop_loss ?? p.stopLoss),
    takeProfit: p?.take_profit == null && p?.takeProfit == null ? null : Number(p.take_profit ?? p.takeProfit),
    profit: Number(p?.profit ?? 0),
    swap: Number(p?.swap ?? 0),
    openedAt: p?.opened_at ?? p?.open_time ?? p?.openTime ?? null,
    raw: p && typeof p === "object" ? p : {}
  };
}
