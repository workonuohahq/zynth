import type { SupabaseClient } from "@supabase/supabase-js";

export const PWA_TOKEN_HEADER = "x-zynth-pwa-token";

export async function hashPwaToken(token: string) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function validatePwaCredential(supabase: SupabaseClient,userId: string,token: string|null|undefined) {
  if (!token) return false;
  const tokenHash = await hashPwaToken(token);
  const { data, error } = await supabase.from("zynth_pwa_devices").select("id").eq("user_id", userId).eq("token_hash", tokenHash).is("revoked_at", null).maybeSingle();
  return !error && Boolean(data?.id);
}