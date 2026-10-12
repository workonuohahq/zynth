import { NextResponse } from "next/server";
import { randomBytes, randomUUID } from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
const SHAPES = [
  { id: "circle", label: "Circle", glyph: "●" },
  { id: "triangle", label: "Triangle", glyph: "▲" },
  { id: "square", label: "Square", glyph: "■" },
  { id: "diamond", label: "Diamond", glyph: "◆" },
  { id: "star", label: "Star", glyph: "★" },
  { id: "hexagon", label: "Hexagon", glyph: "⬡" },
];
function fingerprint(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = request.headers.get("x-real-ip") || forwarded || "unknown";
  const agent = request.headers.get("user-agent") || "unknown";
  return randomBytes(32).toString("hex") && Buffer.from(ip + "|" + agent).toString("base64url").slice(0, 180);
}
function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomBytes(4).readUInt32BE(0) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
export async function GET(request: Request) {
  try {
    const db = createSupabaseAdminClient();
    const { data: setting, error: settingsError } = await db.from("zynth_registration_security").select("human_check_enabled").eq("id", true).maybeSingle();
    if (settingsError) throw settingsError;
    if (setting?.human_check_enabled === false) return NextResponse.json({ enabled: false });
    const fp = fingerprint(request);
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    const { count, error: countError } = await db.from("zynth_human_check_events").select("id", { count: "exact", head: true }).eq("fingerprint", fp).eq("event_type", "challenge").gte("created_at", since);
    if (countError) throw countError;
    if ((count || 0) >= 20) return NextResponse.json({ error: "Too many challenge requests. Please try again in a few minutes." }, { status: 429 });
    const kind = randomBytes(1)[0] % 3;
    const all = shuffled(SHAPES);
    let answer = all[0];
    let sequence: typeof SHAPES = [];
    let prompt = "";
    let challengeType: "pattern" | "match" | "order" = "pattern";
    if (kind === 0) {
      challengeType = "pattern";
      const offset = randomBytes(1)[0] % SHAPES.length;
      sequence = [0, 1, 2, 3].map(n => SHAPES[(offset + n) % SHAPES.length]);
      answer = SHAPES[(offset + 4) % SHAPES.length];
      prompt = "Choose the next symbol in the sequence";
    } else if (kind === 1) {
      challengeType = "match";
      answer = all[randomBytes(1)[0] % 3];
      sequence = [answer];
      prompt = "Find the exact symbol shown in the reference";
    } else {
      challengeType = "order";
      sequence = shuffled(SHAPES).slice(0, 3);
      answer = sequence[1];
      prompt = "Which symbol is in the middle of the shown order?";
    }
    const options = shuffled([answer, ...all.filter(s => s.id !== answer.id).slice(0, 3)]);
    const id = randomUUID();
    const { error: insertError } = await db.from("zynth_human_check_challenges").insert({ id, answer: answer.id, challenge_type: challengeType, expires_at: new Date(Date.now() + 2 * 60_000).toISOString(), request_fingerprint: fp });
    if (insertError) throw insertError;
    const { error: eventError } = await db.from("zynth_human_check_events").insert({ event_type: "challenge", fingerprint: fp });
    if (eventError) throw eventError;
    return NextResponse.json({ enabled: true, id, type: challengeType, prompt, sequence: sequence.map(s => ({ id: s.id, label: s.label, glyph: s.glyph })), options: options.map(s => ({ id: s.id, label: s.label, glyph: s.glyph })), expiresIn: 120 });
  } catch (error) {
    console.error("Human Check challenge unavailable", error);
    return NextResponse.json({ error: "Human verification is temporarily unavailable. Please try again shortly." }, { status: 503 });
  }
}
