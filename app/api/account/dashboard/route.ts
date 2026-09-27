import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const s = await createSupabaseServerClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  await s.rpc("zynth_refresh_profit_lot_statuses");
  const [{ data: profile }, { data: investments }, { data: tx }, { data: lots }, { data: summary }] = await Promise.all([
    s.from("users").select("full_name,kyc_verified").eq("id", user.id).single(),
    s.from("zynth_investments").select("id,principal,principal_remaining,units,entry_nav,current_value,status,strategy_id,zynth_strategies(name,nav)").eq("user_id", user.id).eq("status", "active").order("created_at", { ascending: false }).limit(6),
    s.from("transactions").select("id,type,amount,status,created_at,reference").eq("user_id", user.id).order("created_at", { ascending: false }).limit(6),
    s.from("zynth_profit_lots").select("id,profit_amount,withdrawn_amount,unlock_at,status").eq("user_id", user.id).order("unlock_at", { ascending: true }).limit(6),
    s.rpc("zynth_investor_summary", { p_user_id: user.id })
  ]);
  return NextResponse.json({ profile, investments: investments || [], transactions: tx || [], lots: lots || [], summary: summary || {} });
}