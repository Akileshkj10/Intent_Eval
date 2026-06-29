import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Do not bundle these — @sparticuz/chromium must stay at its installed path
  // so its binary extraction logic can find the compressed Chromium archive.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],

  // Vercel's file tracer doesn't auto-detect large binary assets accessed only
  // at runtime. Explicitly include all @sparticuz/chromium files so the Chromium
  // binary is present in the deployed serverless function bundle.
  outputFileTracingIncludes: {
    "/api/export-pdf": ["./node_modules/@sparticuz/chromium/**/*"],
  },

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
