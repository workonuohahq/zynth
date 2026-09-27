import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase/config";

const PWA_COOKIE = "zynth_pwa_access";

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
      }
    }
  });

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  if (!user && (path.startsWith("/dashboard") || path.startsWith("/admin") || path.startsWith("/trader") || path.startsWith("/api/trader"))) {
    if (path.startsWith("/api/trader")) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (user && path === "/login") return NextResponse.redirect(new URL("/dashboard", request.url));

  if (user && path.startsWith("/dashboard")) {
    const { data: roleKeys } = await supabase.rpc("zynth_get_my_roles", { p_user_id: user.id });
    const roles = Array.isArray(roleKeys) ? roleKeys : [];
    const privileged = roles.some((role: any) =>
      role === "admin" || role === "trader" || role?.role_key === "admin" || role?.role_key === "trader"
    );

    // Admin/trader sessions bypass the investor PWA requirement.
    if (!privileged && !request.cookies.get(PWA_COOKIE)?.value) {
      const installUrl = new URL("/install", request.url);
      installUrl.searchParams.set("next", path);
      return NextResponse.redirect(installUrl);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
    "/trader/:path*",
    "/api/trader/:path*",
    "/btest/:path*",
    "/api/btest/:path*",
    "/login"
  ]
};