import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
export const PWA_TOKEN_HEADER = "x-zynth-pwa-token";
export function hashPwaToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
export async function validatePwaCredential(supabase: SupabaseClient,userId: string,token: string|null|undefined) {
  if (!token) return false;
  const tokenHash = hashPwaToken(token);
  const { data, error } = await supabase.from("zynth_pwa_devices").select("id").eq("user_id", userId).eq("token_hash", tokenHash).is("revoked_at", null).maybeSingle();
  return !error && Boolean(data?.id);
}
