import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase/config";

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
    if (path.startsWith("/api/btest") || path.startsWith("/api/trader")) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (user && path === "/login") return NextResponse.redirect(new URL("/dashboard", request.url));
  return response;
}

export const config = { matcher: ["/dashboard/:path*", "/admin/:path*", "/btest/:path*", "/api/btest/:path*", "/login"] };
