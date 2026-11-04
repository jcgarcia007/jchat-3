"use client";

/**
 * /forgot-password — step 1 of the web password recovery: email + hCaptcha → a 6-digit code by email.
 * The answer is ALWAYS generic ("if an account exists…"): the page never says whether the address has an account.
 * Limits like the app: 60 s between codes (kept in sessionStorage so a reload does not skip it) plus the server's own rate limit.
 * The email goes to /reset-password through sessionStorage, never through the URL.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconLoader2 } from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import InvisibleCaptcha, { type InvisibleCaptchaHandle } from "@/components/InvisibleCaptcha";
import AuthSplitLayout from "@/components/auth/AuthSplitLayout";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { cardStyle, inputStyle, labelStyle, linkStyle, noticeStyle, primaryButton } from "@/components/auth/recoveryStyles";
import {
  RECOVERY_EMAIL_KEY,
  RECOVERY_SENT_AT_KEY,
  cooldownRemaining,
  isPlausibleEmail,
  normalizeEmail,
  recoveryErrorKind,
} from "@/lib/passwordRecovery";

function readSentAt(): number | null {
  try {
    const raw = sessionStorage.getItem(RECOVERY_SENT_AT_KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

function ForgotPasswordForm() {
  const t = useTranslations("passwordRecovery");
  const te = useTranslations("authErrors");
  const router = useRouter();
  const captchaRef = useRef<InvisibleCaptchaHandle>(null);

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  // Pick up the email and the wait left from an earlier send in this tab.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(RECOVERY_EMAIL_KEY);
      if (saved) setEmail(saved);
    } catch { /* storage blocked: the form still works */ }
    setWait(cooldownRemaining(readSentAt(), Date.now()));
  }, []);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const timer = setInterval(() => setWait(cooldownRemaining(readSentAt(), Date.now())), 1000);
    return () => clearInterval(timer);
  }, [wait]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const normalized = normalizeEmail(email);
    if (!isPlausibleEmail(normalized)) { setError(t("invalidEmail")); return; }
    if (cooldownRemaining(readSentAt(), Date.now()) > 0) { setError(t("rateLimited")); return; }
    if (!isSupabaseConfigured) { setError(te("notConfigured")); return; }

    setLoading(true);
    // hCaptcha (D-38): one-use token; the widget is reset after it is consumed. 'disabled' = kill-switch (no sitekey).
    const captcha = (await captchaRef.current?.getToken()) ?? { status: "disabled" as const };
    if (captcha.status === "failed") { setError(t("captchaFailed")); setLoading(false); return; }
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalized, {
      captchaToken: captcha.status === "ok" ? captcha.token : undefined,
    });
    setLoading(false);

    const kind = recoveryErrorKind(resetError);
    if (kind === "rateLimited") { setError(t("rateLimited")); return; }
    if (kind === "captcha") { setError(t("captchaFailed")); return; }
    // Any other answer (including an unknown address) leads to the same generic message: Supabase hides whether the account exists.
    try {
      sessionStorage.setItem(RECOVERY_EMAIL_KEY, normalized);
      sessionStorage.setItem(RECOVERY_SENT_AT_KEY, String(Date.now()));
    } catch { /* storage blocked: /reset-password asks for the email again */ }
    setEmail(normalized);
    setSent(true);
    setWait(cooldownRemaining(Date.now(), Date.now()));
  }

  return (
    <div className="auth-card" style={cardStyle}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>{t("forgotTitle")}</h1>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 20px" }}>{t("forgotSubtitle")}</p>

      {error && <div role="alert" style={noticeStyle("error")}>{error}</div>}
      {sent && <div role="status" style={noticeStyle("info")}>{t("sentGeneric")}</div>}

      <form onSubmit={send}>
        <label htmlFor="recovery-email" style={labelStyle}>{t("emailLabel")}</label>
        <input
          id="recovery-email"
          type="email"
          required
          autoComplete="email"
          placeholder={t("emailPlaceholder")}
          value={email}
          onChange={(ev) => setEmail(ev.target.value)}
          style={inputStyle}
        />
        <button type="submit" className="auth-primary" disabled={loading || wait > 0} style={primaryButton(loading || wait > 0)}>
          {loading && <IconLoader2 size={18} className="spin" />}
          {loading ? t("sending") : sent ? t("resendNow") : t("sendCode")}
        </button>
        {wait > 0 && <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "10px 0 0", textAlign: "center" }}>{t("resendIn", { seconds: wait })}</p>}
        {/* hCaptcha invisible (D-38): no UI unless the challenge fires. */}
        <InvisibleCaptcha ref={captchaRef} />
      </form>

      {sent && (
        <button
          type="button"
          onClick={() => router.push("/reset-password")}
          style={{ ...primaryButton(false), marginTop: 12, background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)" }}
        >
          {t("haveCode")}
        </button>
      )}

      <p style={{ fontSize: 13, textAlign: "center", margin: "20px 0 0" }}>
        <Link href="/auth/login" style={linkStyle}>{t("backToLogin")}</Link>
      </p>
      <div style={{ marginTop: 14, textAlign: "center" }}>
        <LanguageSwitcher />
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <AuthSplitLayout>
      <ForgotPasswordForm />
    </AuthSplitLayout>
  );
}
