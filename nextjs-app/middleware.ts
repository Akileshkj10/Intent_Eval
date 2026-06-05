import { NextRequest, NextResponse } from "next/server";
import { SITE_AUTH_COOKIE, siteAccessKey, siteAuthToken } from "@/lib/siteAuth";

const PUBLIC_PATHS = new Set(["/login", "/api/auth/login"]);

export async function middleware(request: NextRequest) {
  const accessKey = siteAccessKey();
  if (!accessKey) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const expected = await siteAuthToken(accessKey);
  const token = request.cookies.get(SITE_AUTH_COOKIE)?.value;
  if (token === expected) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized. Enter the site access key." }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  if (pathname !== "/") {
    loginUrl.searchParams.set("from", pathname);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
