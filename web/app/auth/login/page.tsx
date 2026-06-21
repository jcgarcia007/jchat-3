"use client";

/**
 * JChat 3.0 — Web Login (Auth)
 * Email + password sign-in and Google OAuth for the business dashboard.
 * On success → redirects to `?next` (default /dashboard).
 * Uses the cookie-based browser client (@/lib/supabase) so the session is
 * readable by the server-side dashboard auth gate.
 */

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  IconMail,
  IconLock,
  IconBrandGoogle,
  IconAlertCircle,
  IconLoader2,
  IconMessageCircle2,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";
  const oauthError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    oauthError === "oauth_failed" ? "Google sign-in failed. Please try again." : null
  );
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isSupabaseConfigured) {
      setError("Auth is not configured. Set Supabase env vars to sign in.");
      return;
    }

    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    router.push(next);
    router.refresh();
  }

  async function handleGoogleLogin() {
    setError(null);

    if (!isSupabaseConfigured) {
      setError("Auth is not configured. Set Supabase env vars to sign in.");
      return;
    }

    setGoogleLoading(true);
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    // On success the browser is redirected to Google, so we only reach here on error.
    if (oauthErr) {
      setGoogleLoading(false);
      setError(oauthErr.message);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px 10px 38px",
    borderRadius: 10,
    border: "1px solid var(--border-subtle)",
    background: "var(--bg-base)",
    color: "var(--text-primary)",
    fontSize: 14,
    outline: "none",
  };

  const iconWrap: React.CSSProperties = {
    position: "absolute",
    left: 12,
    top: "50%",
    transform: "translateY(-50%)",
    color: "var(--text-tertiary)",
    pointerEvents: "none",
  };

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 380,
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 16,
        padding: 28,
        boxShadow: "0 10px 30px var(--bg-overlay)",
      }}
    >
      {/* Brand */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "var(--color-brand)",
            color: "#fff",
          }}
        >
          <IconMessageCircle2 size={20} />
        </span>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>JChat</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Business dashboard
          </div>
        </div>
      </div>

      <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>Sign in</h1>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 20px" }}>
        Access your business dashboard to manage your venue.
      </p>

      {error && (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            padding: "10px 12px",
            marginBottom: 16,
            borderRadius: 10,
            background: "var(--color-brand-light)",
            border: "1px solid var(--color-danger)",
            color: "var(--color-danger)",
            fontSize: 13,
          }}
        >
          <IconAlertCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handlePasswordLogin}>
        <label
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text-secondary)",
            marginBottom: 6,
          }}
        >
          Email
        </label>
        <div style={{ position: "relative", marginBottom: 14 }}>
          <span style={iconWrap}>
            <IconMail size={18} />
          </span>
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="you@business.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
        </div>

        <label
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text-secondary)",
            marginBottom: 6,
          }}
        >
          Password
        </label>
        <div style={{ position: "relative", marginBottom: 20 }}>
          <span style={iconWrap}>
            <IconLock size={18} />
          </span>
          <input
            type="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: "11px 16px",
            borderRadius: 10,
            border: "none",
            background: "var(--color-brand)",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.7 : 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {loading && <IconLoader2 size={18} className="spin" />}
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      {/* Divider */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          margin: "20px 0",
          color: "var(--text-tertiary)",
          fontSize: 12,
        }}
      >
        <span style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
        OR
        <span style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
      </div>

      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={googleLoading}
        style={{
          width: "100%",
          padding: "11px 16px",
          borderRadius: 10,
          border: "1px solid var(--border-subtle)",
          background: "var(--bg-elevated)",
          color: "var(--text-primary)",
          fontSize: 14,
          fontWeight: 600,
          cursor: googleLoading ? "default" : "pointer",
          opacity: googleLoading ? 0.7 : 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
        }}
      >
        {googleLoading ? (
          <IconLoader2 size={18} className="spin" />
        ) : (
          <IconBrandGoogle size={18} />
        )}
        Continue with Google
      </button>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
