export const SITE_AUTH_COOKIE = "site_access_token";

/** Accept common Vercel env names for the shared test-site key. */
export function readSiteAccessKey(): string | undefined {
  const key =
    process.env.SITE_ACCESS_KEY?.trim() ||
    process.env.PASSKEY?.trim() ||
    process.env.SITE_PASSKEY?.trim();
  return key || undefined;
}

export function siteAccessKey(): string | undefined {
  return readSiteAccessKey();
}

export function isSiteAccessEnabled(): boolean {
  return !!readSiteAccessKey();
}

export async function siteAuthToken(key: string): Promise<string> {
  const data = new TextEncoder().encode(`${key}:site-auth-v1`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hasValidSiteAuthCookie(cookieValue: string | undefined): Promise<boolean> {
  const key = readSiteAccessKey();
  if (!key) return true;
  if (!cookieValue) return false;
  return cookieValue === (await siteAuthToken(key));
}
