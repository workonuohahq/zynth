import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const token = process.env.METAAPI_TOKEN;
  if (!token) return NextResponse.json({ error: "METAAPI_TOKEN is not configured on the ZYNTH server." }, { status: 503 });

  const accountId = new URL(request.url).searchParams.get("accountId");
  if (!accountId) return NextResponse.json({ error: "accountId is required." }, { status: 400 });

  try {
    const { default: MetaApi } = await import("metaapi.cloud-sdk");
    const api = new MetaApi(token);
    const account = await api.metatraderAccountApi.getAccount(accountId);
    if (account.state !== "DEPLOYED") await account.deploy();
    await account.waitConnected();

    const connection = account.getRPCConnection();
    await connection.connect();
    const info = await connection.getAccountInformation();

    return NextResponse.json({ snapshot: normalize(info) });
  } catch (error) {
    console.error("ZYNTH BTest refresh error", error);
    return NextResponse.json({ error: safeError(error instanceof Error ? error.message : "MetaApi refresh failed") }, { status: 502 });
  }
}

function normalize(info: any) {
  return {
    login: String(info.login ?? ""),
    name: info.name ?? "",
    server: info.server ?? "",
    platform: "mt5",
    balance: Number(info.balance ?? 0),
    equity: Number(info.equity ?? 0),
    credit: Number(info.credit ?? 0),
    margin: Number(info.margin ?? 0),
    freeMargin: Number(info.freeMargin ?? 0),
    currency: info.currency ?? "",
    tradeMode: info.tradeMode ?? "",
    timestamp: new Date().toISOString()
  };
}

function safeError(message: string) {
  return message.replace(/password[^,;]*/gi, "password [redacted]").slice(0, 500);
}
