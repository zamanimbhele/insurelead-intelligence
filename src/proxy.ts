import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getDataMode, getSupabasePublicConfig } from "@/lib/supabase/config";
import { ADMIN_HOME, homeForRole } from "@/lib/portal";

export async function proxy(request: NextRequest) {
  if (getDataMode() === "demo") return NextResponse.next();

  const config = getSupabasePublicConfig();
  const isDashboard = request.nextUrl.pathname.startsWith("/dashboard");
  const isLogin = request.nextUrl.pathname === "/login";
  const isSignup = request.nextUrl.pathname === "/signup";
  // The admin portal has its own sign-in page; send staff there, not to
  // the broker one, when their session has lapsed.
  const isAdminArea = request.nextUrl.pathname === ADMIN_HOME || request.nextUrl.pathname.startsWith(`${ADMIN_HOME}/`);

  if (!config) {
    if (isDashboard) {
      const url = request.nextUrl.clone();
      url.pathname = isAdminArea ? "/admin/login" : "/login";
      url.searchParams.set("error", "configuration");
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  if (isDashboard && !data.user) {
    const url = request.nextUrl.clone();
    url.pathname = isAdminArea ? "/admin/login" : "/login";
    url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  if ((isLogin || isSignup) && data.user) {
    const url = request.nextUrl.clone();
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
    url.pathname = homeForRole((profile as { role?: string } | null)?.role);
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/signup"],
};
