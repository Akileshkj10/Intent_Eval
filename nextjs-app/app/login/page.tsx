"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Access denied.");
        return;
      }

      const from = searchParams.get("from");
      router.replace(from && from.startsWith("/") ? from : "/");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: "#fff",
        border: "1px solid #d1d5db",
        borderRadius: 8,
        padding: "24px 28px",
      }}
    >
      <label
        htmlFor="access-key"
        style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}
      >
        Access key
      </label>
      <input
        id="access-key"
        type="password"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        autoComplete="current-password"
        placeholder="Enter passkey"
        style={{
          width: "100%",
          padding: "12px 14px",
          fontSize: 14,
          border: "1px solid #d1d5db",
          borderRadius: 6,
          outline: "none",
          marginBottom: 16,
        }}
      />

      {error ? <p style={{ fontSize: 13, color: "#b91c1c", marginBottom: 12 }}>{error}</p> : null}

      <button
        type="submit"
        disabled={loading || !key.trim()}
        style={{
          width: "100%",
          padding: "12px 16px",
          fontSize: 14,
          fontWeight: 600,
          color: "#fff",
          background: loading || !key.trim() ? "#94a3b8" : "#0f172a",
          border: "none",
          borderRadius: 6,
          cursor: loading || !key.trim() ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "Checking…" : "Continue"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", padding: "32px 16px" }}>
      <div style={{ maxWidth: 420, margin: "80px auto 0" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>
            5MAP Intent Evaluator
          </h1>
          <p style={{ fontSize: 13, color: "#64748b" }}>
            Test site · Enter your access key to continue
          </p>
        </div>

        <Suspense fallback={<div style={{ padding: 24, color: "#64748b" }}>Loading…</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
