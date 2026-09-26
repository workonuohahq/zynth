export type MT5AccountInput = {
  login: string;
  server: string;
};

export type MT5AccountData = {
  login: string;
  server: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number | null;
  floatingProfit: number;
  credit: number;
  leverage: number | null;
  currency: string;
};

export type MT5Trade = {
  ticket: string | null;
  symbol: string | null;
  side: string | null;
  volume: number | null;
  entryPrice: number | null;
  exitPrice: number | null;
  profit: number;
  commission: number;
  swap: number;
  openedAt: string | null;
  closedAt: string | null;
  raw?: Record<string, unknown>;
};

/**
 * ZYNTH's MT5 boundary.
 *
 * This file intentionally contains no paid-provider SDK or API key.
 * A future terminal/bridge implementation only needs to return these
 * normalized records. The investment engine never depends on that bridge.
 */
export function validateMT5Login(input: MT5AccountInput) {
  const login = input.login.trim();
  const server = input.server.trim();

  if (!/^\\d+$/.test(login)) throw new Error("MT5 login must contain digits only.");
  if (!server) throw new Error("MT5 server is required.");

  return { login, server };
}

export function normalizeAccount(raw: any, fallback: MT5AccountInput): MT5AccountData {
  const a = raw?.account ?? raw?.data ?? raw;
  return {
    login: String(a?.login ?? fallback.login),
    server: String(a?.server ?? fallback.server),
    balance: Number(a?.balance ?? 0),
    equity: Number(a?.equity ?? 0),
    margin: Number(a?.margin ?? 0),
    freeMargin: Number(a?.free_margin ?? a?.freeMargin ?? 0),
    marginLevel: a?.margin_level == null && a?.marginLevel == null ? null : Number(a?.margin_level ?? a?.marginLevel),
    floatingProfit: Number(a?.profit ?? a?.floating_profit ?? 0),
    credit: Number(a?.credit ?? 0),
    leverage: a?.leverage == null ? null : Number(a.leverage),
    currency: String(a?.currency ?? "")
  };
}

export function normalizeTrade(raw: any): MT5Trade {
  const t = raw?.trade ?? raw?.data ?? raw;
  return {
    ticket: t?.ticket == null && t?.id == null ? null : String(t.ticket ?? t.id),
    symbol: t?.symbol == null ? null : String(t.symbol),
    side: t?.side == null && t?.type == null ? null : String(t.side ?? t.type),
    volume: t?.volume == null ? null : Number(t.volume),
    entryPrice: t?.entry_price == null && t?.entryPrice == null ? null : Number(t.entry_price ?? t.entryPrice),
    exitPrice: t?.exit_price == null && t?.exitPrice == null ? null : Number(t.exit_price ?? t.exitPrice),
    profit: Number(t?.profit ?? 0),
    commission: Number(t?.commission ?? 0),
    swap: Number(t?.swap ?? 0),
    openedAt: t?.opened_at ?? t?.open_time ?? t?.openTime ?? null,
    closedAt: t?.closed_at ?? t?.close_time ?? t?.closeTime ?? null,
    raw: t && typeof t === "object" ? t : {}
  };
}
