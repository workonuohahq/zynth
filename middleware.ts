import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase/config";
import { PWA_TOKEN_HEADER, validatePwaCredential } from "@/lib/pwa/server";

const PUBLIC_API_PREFIXES = ["/api/health", "/api/pwa", "/api/webhooks"];
const ADMIN_API_PREFIX = "/api/admin";

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
function isAdminApi(path: string) { return isPath(path, ADMIN_API_PREFIX); }
function isProtectedApi(path: string) { return path.startsWith("/api/") && !isPublicApi(path) && !isAdminApi(path); }

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
    if (protectedApi) return jsonDenied("AUTH_REQUIRED", "Authentication required.");
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

  if (isAdminApi(path)) {
    if (!isAdmin) return jsonDenied("ADMIN_REQUIRED", "Admin access required.");
    return response;
  }

  if (protectedApi) {
    const token = request.headers.get(PWA_TOKEN_HEADER);
    const valid = await validatePwaCredential(supabase, user.id, token);
    if (!valid) return jsonDenied("PWA_REQUIRED", "Install and open ZYNTH as an app to access protected workspace features.");
    return response;
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/trader/:path*", "/api/:path*", "/login"],
};
