import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase/config";

const PWA_COOKIE = "zynth_pwa_v2";

const PUBLIC_API_PREFIXES = [
  "/api/health",
  "/api/pwa",
  "/api/webhooks",
];

const ROLE_BYPASS_PREFIXES = [
  "/api/admin",
  "/api/trader",
  "/api/webhooks",
];

function startsWithAny(path: string, prefixes: string[]) {
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function isProtectedInvestorApi(path: string) {
  return path.startsWith("/api/") && !startsWithAny(path, PUBLIC_API_PREFIXES) && !startsWithAny(path, ROLE_BYPASS_PREFIXES);
}

function isProtectedInvestorPage(path: string) {
  return path === "/dashboard" || path.startsWith("/dashboard/");
}

function jsonDenied() {
  return NextResponse.json(
    {
      error: "PWA installation required.",
      code: "PWA_REQUIRED",
      message: "Install and open ZYNTH as an app to access investor features.",
    },
    { status: 403 }
  );
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

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
  const path = request.nextUrl.pathname;

  // Public/server endpoints must remain reachable without an authenticated session.
  if (!user) {
    if (
      isProtectedInvestorApi(path) ||
      path.startsWith("/api/trader") ||
      path.startsWith("/admin") ||
      path.startsWith("/trader") ||
      isProtectedInvestorPage(path)
    ) {
      if (path.startsWith("/api/")) return jsonDenied();
      return NextResponse.redirect(new URL("/login", request.url));
    }

    return response;
  }

  // Keep authentication redirects predictable.
  if (path === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Resolve roles once for protected application/API requests.
  const needsRoleCheck =
    isProtectedInvestorPage(path) ||
    path.startsWith("/admin") ||
    path.startsWith("/trader") ||
    path.startsWith("/api/");

  let privileged = false;

  if (needsRoleCheck) {
    const { data: roleKeys } = await supabase.rpc("zynth_get_my_roles", {
      p_user_id: user.id,
    });

    const roles = Array.isArray(roleKeys) ? roleKeys : [];
    privileged = roles.some(
      (role: any) =>
        role === "admin" ||
        role === "trader" ||
        role?.role_key === "admin" ||
        role?.role_key === "trader"
    );
  }

  // Investor application pages are PWA-only. Admin/trader remain browser-accessible.
  if (isProtectedInvestorPage(path) && !privileged && !request.cookies.get(PWA_COOKIE)?.value) {
    const installUrl = new URL("/install", request.url);
    installUrl.searchParams.set("next", path);
    return NextResponse.redirect(installUrl);
  }

  // Investor-facing API endpoints are PWA-only as well, preventing direct API bypasses.
  // Admin, trader, webhook, health and PWA bootstrap endpoints remain exempt.
  if (isProtectedInvestorApi(path) && !privileged && !request.cookies.get(PWA_COOKIE)?.value) {
    return jsonDenied();
  }

  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
    "/trader/:path*",
    "/api/:path*",
    "/btest/:path*",
    "/api/btest/:path*",
    "/login",
  ],
};
