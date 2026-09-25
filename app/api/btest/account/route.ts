import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CLIENT = "https://mt-client-api-v1.new-york.agiliumtrade.ai";

export async function GET(request: Request) {
  const token = process.env.METAAPI_TOKEN;
  if (!token) return NextResponse.json({ error: "METAAPI_TOKEN is not configured on the ZYNTH server." }, { status: 503 });
  const accountId = new URL(request.url).searchParams.get("accountId");
  if (!accountId) return NextResponse.json({ error: "accountId is required." }, { status: 400 });
  try {
    const res = await fetch(CLIENT + "/users/current/accounts/" + encodeURIComponent(accountId) + "/account-information?refreshTerminalState=true", {
      headers: { accept: "application/json", "auth-token": token }, cache: "no-store"
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return NextResponse.json({ error: String(data?.message || data?.error || "MetaApi account read failed").slice(0,500) }, { status: 502 });
    return NextResponse.json({ snapshot: normalize(data) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message.slice(0,500) : "MetaApi refresh failed" }, { status: 502 });
  }
}
function normalize(info: any) {
  return { login: String(info.login ?? ""), name: info.name ?? "", server: info.server ?? "", platform: info.platform ?? "mt5", broker: info.broker ?? "", balance: Number(info.balance ?? 0), equity: Number(info.equity ?? 0), credit: Number(info.credit ?? 0), margin: Number(info.margin ?? 0), freeMargin: Number(info.freeMargin ?? 0), currency: info.currency ?? "", tradeMode: info.type ?? "", timestamp: new Date().toISOString() };
}
