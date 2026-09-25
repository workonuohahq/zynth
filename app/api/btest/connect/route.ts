import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const token = process.env.METAAPI_TOKEN;
  if (!token) return NextResponse.json({ error: "METAAPI_TOKEN is not configured on the ZYNTH server yet." }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const login = String(body.login || "").trim();
  const password = String(body.password || "");
  const server = String(body.server || "").trim();

  if (!/^\d+$/.test(login) || !password || !server) {
    return NextResponse.json({ error: "MT5 login, server and password are required." }, { status: 400 });
  }

  try {
    const { default: MetaApi } = await import("metaapi.cloud-sdk");
    const api = new MetaApi(token);
    const account = await api.metatraderAccountApi.createAccount({
      name: "ZYNTH BTest",
      login,
      password,
      server,
      platform: "mt5",
      magic: 0,
      type: "cloud-g2"
    });

    await account.deploy();
    await account.waitConnected();

    const connection = account.getRPCConnection();
    await connection.connect();
    const info = await connection.getAccountInformation();

    return NextResponse.json({
      accountId: account.id,
      snapshot: normalize(info)
    });
  } catch (error) {
    console.error("ZYNTH BTest MetaApi connection error", error);
    const message = error instanceof Error ? error.message : "MetaApi connection failed";
    return NextResponse.json({ error: safeError(message) }, { status: 502 });
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
