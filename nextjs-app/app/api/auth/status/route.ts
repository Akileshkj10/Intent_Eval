import { connection } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { SITE_AUTH_COOKIE, hasValidSiteAuthCookie, isSiteAccessEnabled } from "@/lib/siteAuth";

export async function GET(req: NextRequest) {
  await connection();
  const protectionEnabled = isSiteAccessEnabled();
  const token = req.cookies.get(SITE_AUTH_COOKIE)?.value;
  const authenticated = await hasValidSiteAuthCookie(token);

  return NextResponse.json({
    protectionEnabled,
    authenticated,
  });
}
