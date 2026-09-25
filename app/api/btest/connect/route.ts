import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const MTAPI_BASE = (process.env.MTAPI_BASE_URL || "https://mt5.mtapi.io").replace(/\/$/, "");

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const login = String(body.login || "").trim(), password = String(body.password || ""), server = String(body.server || "").trim();
  if (!/^\d+$/.test(login) || !password || !server) return NextResponse.json({ error: "MT5 login, server and password are required." }, { status: 400 });
  const sessionId = crypto.randomUUID(), url = new URL(MTAPI_BASE + "/ConnectEx");
  url.searchParams.set("user", login); url.searchParams.set("password", password); url.searchParams.set("server", server); url.searchParams.set("id", sessionId);
  url.searchParams.set("connectTimeoutSeconds", "60"); url.searchParams.set("connectTimeoutClusterMemberSeconds", "20");
  try {
    const res = await fetch(url, { headers: { accept: "text/plain" }, cache: "no-store" }), text = await res.text();
    if (!res.ok || !text || /error|exception|failed/i.test(text.slice(0,300))) return NextResponse.json({ error: safe(text,res.status,"MT5 connection failed") }, { status: 502 });
    const id = text.trim().replace(/^"|"$/g, ""), snapshot = await account(id), fingerprint = crypto.createHash("sha256").update(id).digest("hex");
    const supabase = createSupabaseAdminClient();
    const { data: connection, error } = await supabase.from("btest_mt5_connections").upsert({
      session_fingerprint:fingerprint, mt5_login:login, mt5_server:server, provider:"mtapi", status:"connected", last_seen_at:new Date().toISOString()
    }, { onConflict:"session_fingerprint" }).select("id").single();
    if (error) throw error;
    const { error: snapshotError } = await supabase.from("btest_mt5_snapshots").insert({
      connection_id:connection.id, balance:snapshot.balance, equity:snapshot.equity, margin:snapshot.margin, free_margin:snapshot.freeMargin,
      margin_level:snapshot.marginLevel, profit:snapshot.profit, credit:snapshot.credit, leverage:snapshot.leverage, currency:snapshot.currency, server:snapshot.server || server
    });
    if (snapshotError) throw snapshotError;
    const out=NextResponse.json({connectionId:connection.id,snapshot:{...snapshot,login,server:snapshot.server||server,timestamp:new Date().toISOString()}});
    out.cookies.set("zynth_btest_mtapi",id,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/api/btest",maxAge:28800});
    out.cookies.set("zynth_btest_connection",connection.id,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/api/btest",maxAge:28800});
    return out;
  } catch(e) { return NextResponse.json({error:safe(e instanceof Error?e.message:"MT5 connection failed",502,"MT5 connection failed")},{status:502}); }
}
async function account(id:string){ const u=new URL(MTAPI_BASE+"/AccountSummary"); u.searchParams.set("id",id); const r=await fetch(u,{headers:{accept:"application/json"},cache:"no-store"}); const d=await r.json().catch(()=>({})); if(!r.ok||d?.error||d?.exception) throw new Error(safe(JSON.stringify(d),r.status,"MT5 account data could not be read")); return norm(d); }
function norm(i:any){return {balance:Number(i.balance??0),equity:Number(i.equity??0),margin:Number(i.margin??0),freeMargin:Number(i.freeMargin??0),marginLevel:i.marginLevel==null?null:Number(i.marginLevel),profit:Number(i.profit??0),credit:Number(i.credit??0),leverage:i.leverage==null?null:Number(i.leverage),currency:String(i.currency??""),server:String(i.server??"")};}
function safe(raw:string,status:number,fallback:string){const msg=raw.replace(/password[^,;]*/gi,"password [redacted]").slice(0,500); return msg || fallback+" ("+status+")";}
