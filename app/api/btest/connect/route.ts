import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PROVISIONING = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";
const CLIENT = "https://mt-client-api-v1.new-york.agiliumtrade.ai";

export async function POST(request: Request) {
  const token = process.env.METAAPI_TOKEN;
  if (!token) return NextResponse.json({ error: "METAAPI_TOKEN is not configured on the ZYNTH server yet." }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const login = String(body.login || "").trim();
  const password = String(body.password || "");
  const server = String(body.server || "").trim();
  if (!/^\d+$/.test(login) || !password || !server) return NextResponse.json({ error: "MT5 login, server and password are required." }, { status: 400 });

  try {
    const accountRes = await fetch(PROVISIONING + "/users/current/accounts", {
      method: "POST",
      headers: { "content-type": "application/json", "accept": "application/json", "auth-token": token, "transaction-id": crypto.randomUUID().replaceAll("-","") },
      body: JSON.stringify({ name: "ZYNTH BTest", login, password, server, platform: "mt5", magic: 0, type: "cloud-g2" }),
      cache: "no-store"
    });
    const accountData = await accountRes.json().catch(() => ({}));
    if (!accountRes.ok) return NextResponse.json({ error: metaError(accountData, accountRes.status) }, { status: 502 });
    const accountId = accountData.id;
    if (!accountId) return NextResponse.json({ error: "MetaApi did not return an account id." }, { status: 502 });

    const deployRes = await fetch(PROVISIONING + "/users/current/accounts/" + encodeURIComponent(accountId) + "/deploy", {
      method: "POST", headers: { accept: "application/json", "auth-token": token }, cache: "no-store"
    });
    if (!deployRes.ok && deployRes.status !== 204) {
      const deployData = await deployRes.json().catch(() => ({}));
      return NextResponse.json({ error: metaError(deployData, deployRes.status) }, { status: 502 });
    }

    const snapshot = await waitForSnapshot(token, accountId);
    return NextResponse.json({ accountId, snapshot });
  } catch (error) {
    console.error("ZYNTH BTest MetaApi error", error);
    return NextResponse.json({ error: safeError(error instanceof Error ? error.message : "MetaApi connection failed") }, { status: 502 });
  }
}

async function waitForSnapshot(token: string, accountId: string) {
  let last = "";
  for (let i = 0; i < 8; i++) {
    const res = await fetch(CLIENT + "/users/current/accounts/" + encodeURIComponent(accountId) + "/account-information?refreshTerminalState=true", {
      headers: { accept: "application/json", "auth-token": token }, cache: "no-store"
    });
    if (res.ok) return normalize(await res.json());
    last = await res.text();
    await new Promise(r => setTimeout(r, 2500));
  }
  throw new Error("MetaApi account did not become readable in time: " + last.slice(0, 300));
}

function normalize(info: any) {
  return { login: String(info.login ?? ""), name: info.name ?? "", server: info.server ?? "", platform: info.platform ?? "mt5", broker: info.broker ?? "", balance: Number(info.balance ?? 0), equity: Number(info.equity ?? 0), credit: Number(info.credit ?? 0), margin: Number(info.margin ?? 0), freeMargin: Number(info.freeMargin ?? 0), currency: info.currency ?? "", tradeMode: info.type ?? "", timestamp: new Date().toISOString() };
}
function metaError(data: any, status: number) { return String(data?.message || data?.details || data?.error || ("MetaApi request failed (" + status + ")")).slice(0, 500).replace(/password[^,;]*/gi, "password [redacted]"); }
function safeError(message: string) { return message.slice(0, 500).replace(/password[^,;]*/gi, "password [redacted]"); }
