import { cookies } from "next/headers";
import { connection } from "next/server";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  SITE_AUTH_COOKIE,
  hasValidSiteAuthCookie,
  isSiteAccessEnabled,
  readSiteAccessKey,
} from "@/lib/siteAuth";

export async function verifySiteAuthFromCookies(): Promise<boolean> {
  await connection();
  if (!isSiteAccessEnabled()) return true;
  const token = (await cookies()).get(SITE_AUTH_COOKIE)?.value;
  return hasValidSiteAuthCookie(token);
}

export async function requireSiteAuthRequest(req: NextRequest): Promise<NextResponse | null> {
  await connection();
  if (!readSiteAccessKey()) return null;
  const token = req.cookies.get(SITE_AUTH_COOKIE)?.value;
  if (await hasValidSiteAuthCookie(token)) return null;
  return NextResponse.json({ error: "Unauthorized. Enter the site access key." }, { status: 401 });
}
