"use client";

/**
 * JChat 3.0 — Web Login (Auth)
 * Email + password sign-in and Google OAuth for the business dashboard.
 * On success → redirects to `?next` (default /dashboard).
 * Uses the cookie-based browser client (@/lib/supabase) so the session is
 * readable by the server-side dashboard auth gate.
 */

import { Suspense, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { isSafeRedirectPath } from "@/lib/redirect";
import InvisibleCaptcha, { type InvisibleCaptchaHandle } from "@/components/InvisibleCaptcha";
import {
  IconMail,
  IconLock,
  IconBrandGoogle,
  IconBrandFacebook,
  IconBrandApple,
  IconAlertCircle,
  IconLoader2,
  IconMessageCircle2,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Accept ?next= (dashboard flow) or ?redirect= (QR flow). Validate: must be a safe
  // internal relative path (rejects //evil.com, /\evil.com, schemes) — open-redirect (W2).
  const rawNext = searchParams.get("next") ?? searchParams.get("redirect") ?? "/dashboard";
  const next = isSafeRedirectPath(rawNext) ? rawNext : "/dashboard";
  const oauthError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    oauthError === "oauth_failed" ? "Google sign-in failed. Please try again." : null
  );
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  // hCaptcha (D-38): token pedido en el submit; el widget se monta abajo.
  const captchaRef = useRef<InvisibleCaptchaHandle>(null);

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isSupabaseConfigured) {
      setError("Auth is not configured. Set Supabase env vars to sign in.");
      return;
    }

    setLoading(true);
    // Token de un solo uso; getToken() resetea el widget tras consumirlo. null cuando
    // el captcha está desactivado (kill-switch) o el reto falla → Supabase lo ignora
    // mientras el captcha esté global-OFF.
    const captchaToken = (await captchaRef.current?.getToken()) ?? null;
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
      options: { captchaToken: captchaToken ?? undefined },
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

        {/* hCaptcha invisible (D-38): sin UI salvo cuando el reto se dispara. */}
        <InvisibleCaptcha ref={captchaRef} />
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

      {/* Facebook — coming soon (provider not configured in Supabase yet) */}
      <button
        type="button"
        disabled
        title="Coming soon — Facebook login próximamente"
        style={{
          width: "100%",
          marginTop: 10,
          padding: "11px 16px",
          borderRadius: 10,
          border: "1px solid var(--border-subtle)",
          background: "var(--bg-elevated)",
          color: "var(--text-primary)",
          fontSize: 14,
          fontWeight: 600,
          cursor: "not-allowed",
          opacity: 0.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
        }}
      >
        <IconBrandFacebook size={18} style={{ color: "#1877F2" }} />
        Continue with Facebook
      </button>

      {/* Apple — coming soon (provider not configured in Supabase yet) */}
      <button
        type="button"
        disabled
        title="Coming soon — Apple login próximamente"
        style={{
          width: "100%",
          marginTop: 10,
          padding: "11px 16px",
          borderRadius: 10,
          border: "1px solid var(--border-subtle)",
          background: "var(--bg-elevated)",
          color: "var(--text-primary)",
          fontSize: 14,
          fontWeight: 600,
          cursor: "not-allowed",
          opacity: 0.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
        }}
      >
        <IconBrandApple size={18} style={{ color: "var(--text-primary)" }} />
        Continue with Apple
      </button>

      {/* Sign up link */}
      <p
        style={{
          fontSize: 13,
          color: "var(--text-secondary)",
          textAlign: "center",
          margin: "20px 0 0",
        }}
      >
        Don&apos;t have an account?{" "}
        <a href="/auth/register" style={{ color: "var(--color-brand)", fontWeight: 600 }}>
          Sign up
        </a>
      </p>
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
