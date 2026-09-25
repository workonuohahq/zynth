import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const client = await createSupabaseServerClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const [{ data: requestRow, error: requestError }, { data: settings, error: settingsError }] = await Promise.all([
      client.from("deposit_requests").select("id,amount,method,status,reference,payment_reference,user_note,admin_note,created_at,processed_at").eq("id", params.id).eq("user_id", user.id).single(),
      client.rpc("get_deposit_payment_config").single()
    ]);

    if (requestError || !requestRow) return NextResponse.json({ error: "Payment request not found." }, { status: 404 });
    if (settingsError || !settings) return NextResponse.json({ error: "Payment configuration unavailable." }, { status: 503 });

    return NextResponse.json({ request: requestRow, settings });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load payment request." }, { status: 500 });
  }
}