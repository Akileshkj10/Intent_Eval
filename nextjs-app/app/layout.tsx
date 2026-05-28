import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "5MAP Intent Evaluator",
  description: "Evaluate 5MAP strategic intent documents — Test AI Version",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
