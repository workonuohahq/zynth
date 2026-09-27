import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase/config";
import { PWA_TOKEN_HEADER, validatePwaCredential } from "@/lib/pwa/server";

const PUBLIC_API_PREFIXES = ["/api/health", "/api/pwa", "/api/webhooks"];
// Push registration is authenticated by its route handlers, but it is not a
// PWA-protected workspace API. This is intentional: browser users, including
// administrators, must be able to opt into device notifications without
// installing the ZYNTH PWA.
const PUSH_API_PREFIXES = ["/api/push"];
// The VAPID public key is intentionally public. This endpoint is only a
// configuration bridge for deployments that do not hold the push key locally.
const PUBLIC_PUSH_CONFIG_PATH = "/api/push/public-config";

function isPath(path: string, prefix: string) {
  return path === prefix || path.startsWith(`${prefix}/`);
}
function startsWithAny(path: string, prefixes: string[]) {
  return prefixes.some((prefix) => isPath(path, prefix));
}
function isInvestorPage(path: string) { return isPath(path, "/dashboard"); }
function isAdminPage(path: string) { return isPath(path, "/admin"); }
function isTraderPage(path: string) { return isPath(path, "/trader"); }
function isPublicApi(path: string) { return startsWithAny(path, PUBLIC_API_PREFIXES); }
function isPushApi(path: string) { return startsWithAny(path, PUSH_API_PREFIXES); }
function isProtectedApi(path: string) {
  return path.startsWith("/api/") &&
    !isPublicApi(path) &&
    !isPushApi(path) &&
    !isPath(path, "/api/admin");
}

function getRoleKeys(roleRows: unknown) {
  if (!Array.isArray(roleRows)) return new Set<string>();
  return new Set(
    roleRows
      .map((role: any) => (typeof role === "string" ? role : role?.role_key))
      .filter((role): role is string => typeof role === "string")
  );
}
function jsonDenied(code: string, message: string) {
  return NextResponse.json({ error: message, code, message }, { status: 403 });
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const path = request.nextUrl.pathname;

  // The VAPID public key is not a credential. Keep this tiny endpoint public so
  // the Vercel deployment can source the same key that the Render push worker
  // actually uses, avoiding two independently managed VAPID configurations.
  if (path === PUBLIC_PUSH_CONFIG_PATH) {
    response.headers.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
    return response;
  }

  // The Supabase push trigger calls this private worker endpoint directly.
  // It is authenticated with a dedicated secret, not a user session.
  if (path === "/api/internal/push/process" && request.headers.get("x-zynth-push-secret") === process.env.ZYNTH_PUSH_WORKER_SECRET) {
    return response;
  }

  // Authenticated ZYNTH surfaces are user-specific. Never allow an intermediary
  // or browser cache to retain a workspace response.
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  const protectedPage = isInvestorPage(path) || isAdminPage(path) || isTraderPage(path);
  const protectedApi = isProtectedApi(path);

  if (!user) {
    if (protectedApi || isPushApi(path)) return jsonDenied("AUTH_REQUIRED", "Authentication required.");
    if (protectedPage) return NextResponse.redirect(new URL("/login", request.url));
    return response;
  }

  if (path === "/login") return NextResponse.redirect(new URL("/dashboard", request.url));

  let roles = new Set<string>();
  if (protectedPage || protectedApi) {
    const { data: roleRows } = await supabase.rpc("zynth_get_my_roles", { p_user_id: user.id });
    roles = getRoleKeys(roleRows);
  }

  const isAdmin = roles.has("admin");
  const isTrader = roles.has("trader");
  const isInvestor = roles.has("investor");

  if (isAdminPage(path)) {
    if (!isAdmin) return NextResponse.redirect(new URL("/dashboard", request.url));
    return response;
  }

  if (isTraderPage(path)) {
    if (!isTrader) return NextResponse.redirect(new URL("/dashboard", request.url));
    return response;
  }

  if (isInvestorPage(path)) {
    if (!isInvestor) {
      if (isAdmin) return NextResponse.redirect(new URL("/admin", request.url));
      if (isTrader) return NextResponse.redirect(new URL("/trader", request.url));
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return response;
  }

  if (protectedApi) {
    const token = request.headers.get(PWA_TOKEN_HEADER);
    const valid = await validatePwaCredential(supabase, user.id, token);
    if (!valid) return jsonDenied("PWA_REQUIRED", "Install and open ZYNTH as an app to access protected workspace features.");
    return response;
  }

  // Push endpoints perform their own authentication/validation. They deliberately
  // bypass the PWA credential check so notification opt-in remains browser-capable.
  if (isPushApi(path)) return response;

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/trader/:path*", "/api/:path*", "/login"],
};
