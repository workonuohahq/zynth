import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase/config";

const PWA_COOKIE = "zynth_pwa_v2";

const PUBLIC_API_PREFIXES = [
  "/api/health",
  "/api/pwa",
  "/api/webhooks",
];

const ADMIN_API_PREFIX = "/api/admin";
const TRADER_API_PREFIX = "/api/trader";

function isPath(path: string, prefix: string) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function startsWithAny(path: string, prefixes: string[]) {
  return prefixes.some((prefix) => isPath(path, prefix));
}

function isInvestorPage(path: string) {
  return isPath(path, "/dashboard");
}

function isAdminPage(path: string) {
  return isPath(path, "/admin");
}

function isTraderPage(path: string) {
  return isPath(path, "/trader");
}

function isPublicApi(path: string) {
  return startsWithAny(path, PUBLIC_API_PREFIXES);
}

function isAdminApi(path: string) {
  return isPath(path, ADMIN_API_PREFIX);
}

function isTraderApi(path: string) {
  return isPath(path, TRADER_API_PREFIX);
}

/**
 * ZYNTH currently has legacy investor APIs outside /api/investor/*.
 * Until those routes are migrated into an explicit namespace, authenticated
 * non-public/non-admin/non-trader APIs are treated as protected workspace APIs.
 * This prevents a direct API call from bypassing the PWA gate.
 */
function isProtectedWorkspaceApi(path: string) {
  return path.startsWith("/api/") && !isPublicApi(path) && !isAdminApi(path) && !isTraderApi(path);
}

function hasPwaCapability(request: NextRequest) {
  return Boolean(request.cookies.get(PWA_COOKIE)?.value);
}

function getRoleKeys(roleRows: unknown) {
  if (!Array.isArray(roleRows)) return new Set<string>();

  const keys = roleRows
    .map((role: any) => (typeof role === "string" ? role : role?.role_key))
    .filter((role): role is string => typeof role === "string");

  return new Set(keys);
}

function jsonDenied(code: string, message: string) {
  return NextResponse.json(
    {
      error: message,
      code,
      message,
    },
    { status: 403 }
  );
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtectedPage = isInvestorPage(path) || isAdminPage(path) || isTraderPage(path);
  const isProtectedApi =
    isProtectedWorkspaceApi(path) || isAdminApi(path) || isTraderApi(path);

  if (!user) {
    if (isProtectedApi) {
      if (isPublicApi(path)) return response;
      return jsonDenied("AUTH_REQUIRED", "Authentication required.");
    }

    if (isProtectedPage) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    return response;
  }

  if (path === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  let roles = new Set<string>();

  if (isProtectedPage || isProtectedApi) {
    const { data: roleRows } = await supabase.rpc("zynth_get_my_roles", {
      p_user_id: user.id,
    });
    roles = getRoleKeys(roleRows);
  }

  const isAdmin = roles.has("admin");
  const isTrader = roles.has("trader");
  const isInvestor = roles.has("investor");
  const pwaReady = hasPwaCapability(request);

  // Admin console remains browser-accessible, but still requires the admin role.
  if (isAdminPage(path)) {
    if (!isAdmin) return NextResponse.redirect(new URL("/dashboard", request.url));
    return response;
  }

  // Trader Desk is a protected workspace. Trader role + PWA capability are both required.
  if (isTraderPage(path)) {
    if (!isTrader) return NextResponse.redirect(new URL("/dashboard", request.url));

    if (!pwaReady) {
      const installUrl = new URL("/install", request.url);
      installUrl.searchParams.set("next", path);
      return NextResponse.redirect(installUrl);
    }

    return response;
  }

  // Investor dashboard is a protected workspace. Investor role + PWA capability are required.
  if (isInvestorPage(path)) {
    if (!isInvestor) {
      if (isAdmin) return NextResponse.redirect(new URL("/admin", request.url));
      if (isTrader) return NextResponse.redirect(new URL("/trader", request.url));
      return NextResponse.redirect(new URL("/login", request.url));
    }

    if (!pwaReady) {
      const installUrl = new URL("/install", request.url);
      installUrl.searchParams.set("next", path);
      return NextResponse.redirect(installUrl);
    }

    return response;
  }

  // Admin APIs are role-protected but do not require PWA.
  if (isAdminApi(path)) {
    if (!isAdmin) return jsonDenied("ADMIN_REQUIRED", "Admin access required.");
    return response;
  }

  // Trader APIs are role-protected and PWA-required, matching the Trader Desk.
  if (isTraderApi(path)) {
    if (!isTrader) return jsonDenied("TRADER_REQUIRED", "Trader access required.");
    if (!pwaReady) return jsonDenied(
      "PWA_REQUIRED",
      "Install and open ZYNTH as an app to access the Trader Desk."
    );
    return response;
  }

  // Legacy investor APIs are PWA-required. Public, webhook and PWA bootstrap
  // routes are explicitly excluded above.
  if (isProtectedWorkspaceApi(path)) {
    if (!isInvestor) {
      return jsonDenied("INVESTOR_REQUIRED", "Investor access required.");
    }

    if (!pwaReady) {
      return jsonDenied(
        "PWA_REQUIRED",
        "Install and open ZYNTH as an app to access protected workspace features."
      );
    }

    return response;
  }

  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
    "/trader/:path*",
    "/api/:path*",
    "/login",
  ],
};
