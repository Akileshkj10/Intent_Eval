export const SITE_AUTH_COOKIE = "site_access_token";

export function siteAccessKey(): string | undefined {
  const key = process.env.SITE_ACCESS_KEY?.trim();
  return key || undefined;
}

export function isSiteAccessEnabled(): boolean {
  return !!siteAccessKey();
}

export async function siteAuthToken(key: string): Promise<string> {
  const data = new TextEncoder().encode(`${key}:site-auth-v1`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
