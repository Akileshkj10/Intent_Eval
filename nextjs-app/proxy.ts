import { connection } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import {
  SITE_AUTH_COOKIE,
  hasValidSiteAuthCookie,
  readSiteAccessKey,
} from "@/lib/siteAuth";

const PUBLIC_PATHS = new Set(["/login", "/api/auth/login", "/api/auth/status"]);

export async function proxy(request: NextRequest) {
  await connection();

  const accessKey = readSiteAccessKey();
  if (!accessKey) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const token = request.cookies.get(SITE_AUTH_COOKIE)?.value;
  if (await hasValidSiteAuthCookie(token)) return NextResponse.next();

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
