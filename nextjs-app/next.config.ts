import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent Next.js from bundling these packages — @sparticuz/chromium relies on
  // its binary files staying at their installed path. If bundled, those paths break.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],

  async headers() {
    return [
      {
        source: "/((?!_next/static|_next/image|favicon.ico).*)",
        headers: [{ key: "Cache-Control", value: "private, no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
