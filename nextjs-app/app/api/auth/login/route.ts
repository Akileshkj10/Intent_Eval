import { timingSafeEqual } from "crypto";
import { connection } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import {
  SITE_AUTH_COOKIE,
  isSiteAccessEnabled,
  readSiteAccessKey,
  siteAuthToken,
} from "@/lib/siteAuth";

function keysMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  await connection();
  const accessKey = readSiteAccessKey();
  if (!accessKey) {
    return NextResponse.json({ ok: true, protection: false });
  }

  let body: { key?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const provided = (body.key ?? "").trim();
  if (!provided || !keysMatch(provided, accessKey)) {
    return NextResponse.json({ error: "Incorrect access key." }, { status: 401 });
  }

  const token = await siteAuthToken(accessKey);
  const response = NextResponse.json({ ok: true, protection: isSiteAccessEnabled() });
  response.cookies.set(SITE_AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    // Session cookie: cleared when the browser closes (no maxAge).
  });
  return response;
}
