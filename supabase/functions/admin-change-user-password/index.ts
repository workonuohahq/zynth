import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const authorization = request.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!authorization || !supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: "Password management is not configured." }, 503);
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: callerResult, error: callerError } = await callerClient.auth.getUser();
    const caller = callerResult?.user;

    if (callerError || !caller) return json({ error: "Authentication required." }, 401);

    const { data: roles, error: rolesError } = await callerClient.rpc("zynth_get_my_roles", {
      p_user_id: caller.id,
    });
    if (rolesError || !Array.isArray(roles) || !roles.includes("admin")) {
      return json({ error: "Active administrator authorization required." }, 403);
    }

    const { data: callerProfile, error: profileError } = await callerClient
      .from("users")
      .select("account_status")
      .eq("id", caller.id)
      .maybeSingle();

    if (profileError || callerProfile?.account_status !== "active") {
      return json({ error: "Active administrator authorization required." }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const targetUserId = String(body.targetUserId || "");
    const currentAdminPassword = String(body.currentAdminPassword || "");
    const newPassword = String(body.newPassword || "");
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const passwordBytes = new TextEncoder().encode(newPassword).length;

    if (!uuidPattern.test(targetUserId)) return json({ error: "Invalid user selected." }, 400);
    if (!currentAdminPassword) return json({ error: "Enter your current administrator password to confirm this action." }, 400);
    if (
      newPassword.length < 12 ||
      passwordBytes > 72 ||
      !/[a-z]/.test(newPassword) ||
      !/[A-Z]/.test(newPassword) ||
      !/[0-9]/.test(newPassword) ||
      !/[^A-Za-z0-9]/.test(newPassword)
    ) {
      return json({
        error: "Use a password of at least 12 characters with uppercase and lowercase letters, a number and a symbol. Maximum: 72 UTF-8 bytes.",
      }, 400);
    }

    const reauthClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { data: reauth, error: reauthError } = await reauthClient.auth.signInWithPassword({
      email: caller.email || "",
      password: currentAdminPassword,
    });
    if (reauthError || !reauth.session || reauth.user?.id !== caller.id) {
      return json({ error: "Administrator password confirmation failed." }, 403);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: isProtected, error: protectionError } = await adminClient.rpc(
      "zynth_is_protected_admin",
      { p_user_id: targetUserId },
    );
    if (protectionError) return json({ error: "Unable to verify protected-account status." }, 503);
    if (isProtected === true) {
      return json({
        error: "The primary administrator account is protected from admin-initiated password resets. Use its own account password-change or recovery process.",
      }, 403);
    }

    const { data: targetResult, error: targetError } = await adminClient.auth.admin.getUserById(targetUserId);
    const target = targetResult?.user;
    if (targetError || !target) return json({ error: "User account not found." }, 404);

    const { error: attemptAuditError } = await adminClient.from("audit_logs").insert({
      actor_user_id: caller.id,
      action: "user.password_change_attempted",
      target_type: "user",
      target_id: targetUserId,
      metadata: {
        target_email: target.email || null,
        source: "admin_users_security_tab",
        administrator_reauthenticated: true,
      },
    });
    if (attemptAuditError) {
      return json({ error: "Password change was not started because the audit trail is unavailable." }, 503);
    }

    const { error: updateError } = await adminClient.auth.admin.updateUserById(targetUserId, {
      password: newPassword,
    });

    if (updateError) {
      await adminClient.from("audit_logs").insert({
        actor_user_id: caller.id,
        action: "user.password_change_failed",
        target_type: "user",
        target_id: targetUserId,
        metadata: { target_email: target.email || null, reason: "Supabase Auth rejected the password update." },
      });
      return json({ error: "Supabase could not update this user's password. No successful change was recorded." }, 400);
    }

    const { error: successAuditError } = await adminClient.from("audit_logs").insert({
      actor_user_id: caller.id,
      action: "user.password_changed",
      target_type: "user",
      target_id: targetUserId,
      metadata: {
        target_email: target.email || null,
        source: "admin_users_security_tab",
        administrator_reauthenticated: true,
        password_value_recorded: false,
      },
    });

    return json({
      ok: true,
      auditLogged: !successAuditError,
      warning: successAuditError
        ? "Password changed, but the success audit entry could not be written. The attempted action remains recorded; investigate the audit log."
        : null,
    });
  } catch {
    return json({ error: "Unable to complete the password change." }, 500);
  }
});
