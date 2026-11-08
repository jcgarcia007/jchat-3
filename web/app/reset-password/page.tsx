"use client";

/**
 * /reset-password — step 2 of the web password recovery: the 6-digit code + the new password.
 *   verifyOtp({ email, token, type: 'recovery' })  →  updateUser({ password })  →  signOut({ scope: 'others' })
 * (the same three calls as the app). The code is only checked here; a wrong or expired code never says which. After 5 wrong
 * codes the form locks for 15 minutes (the server has its own limits too). The email arrives through sessionStorage, not the URL.
 * Raw error messages are never shown: only the translated ones.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconLoader2 } from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { authErrorKey } from "@/lib/authErrors";
import AuthSplitLayout from "@/components/auth/AuthSplitLayout";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { cardStyle, inputStyle, labelStyle, linkStyle, noticeStyle, primaryButton } from "@/components/auth/recoveryStyles";
import {
  FRESH_ATTEMPTS,
  RECOVERY_EMAIL_KEY,
  RECOVERY_SENT_AT_KEY,
  isCodeComplete,
  isPlausibleEmail,
  lockMinutesLeft,
  normalizeCode,
  normalizeEmail,
  passwordProblem,
  registerFailure,
  type AttemptState,
} from "@/lib/passwordRecovery";

const ATTEMPTS_KEY = "jchat.recovery.attempts";

function loadAttempts(): AttemptState {
  try {
    const raw = sessionStorage.getItem(ATTEMPTS_KEY);
    if (!raw) return FRESH_ATTEMPTS;
    const parsed = JSON.parse(raw) as Partial<AttemptState>;
    return { fails: Number(parsed.fails) || 0, lockedUntil: typeof parsed.lockedUntil === "number" ? parsed.lockedUntil : null };
  } catch {
    return FRESH_ATTEMPTS;
  }
}

function saveAttempts(state: AttemptState) {
  try { sessionStorage.setItem(ATTEMPTS_KEY, JSON.stringify(state)); } catch { /* storage blocked */ }
}

function ResetPasswordForm() {
  const t = useTranslations("passwordRecovery");
  const te = useTranslations("authErrors");
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<AttemptState>(FRESH_ATTEMPTS);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(RECOVERY_EMAIL_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads sessionStorage, which only exists in the browser, once on mount
      if (saved) setEmail(saved);
    } catch { /* storage blocked: the person types the email */ }
    setAttempts(loadAttempts());
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const minutes = lockMinutesLeft(attempts, Date.now());
    if (minutes > 0) { setError(t("locked", { minutes })); return; }
    const normalized = normalizeEmail(email);
    if (!isPlausibleEmail(normalized)) { setError(t("invalidEmail")); return; }
    if (!isCodeComplete(code)) { setError(t("needCode")); return; }
    const problem = passwordProblem(password, confirm);
    if (problem) { setError(t(problem)); return; }
    if (!isSupabaseConfigured) { setError(te("notConfigured")); return; }

    setLoading(true);
    const { data, error: otpError } = await supabase.auth.verifyOtp({ email: normalized, token: code, type: "recovery" });
    if (otpError || !data.session) {
      setLoading(false);
      const next = registerFailure(attempts, Date.now());
      setAttempts(next);
      saveAttempts(next);
      const left = lockMinutesLeft(next, Date.now());
      setError(left > 0 ? t("locked", { minutes: left }) : t("codeInvalid"));
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setLoading(false);
      // same_password / weak_password have their own translated text; anything else is the generic one.
      const key = authErrorKey(updateError);
      setError(key === "generic" ? t("updateError") : te(key));
      return;
    }

    // Close every OTHER session of this account (a thief with the old password loses access); this device stays signed in.
    const { error: othersError } = await supabase.auth.signOut({ scope: "others" });
    if (othersError) console.warn("[reset-password] could not revoke the other sessions:", othersError.message);

    try {
      sessionStorage.removeItem(RECOVERY_EMAIL_KEY);
      sessionStorage.removeItem(RECOVERY_SENT_AT_KEY);
      sessionStorage.removeItem(ATTEMPTS_KEY);
    } catch { /* storage blocked */ }
    setLoading(false);
    setDone(true);
  }

  if (done) {
    return (
      <div className="auth-card" style={cardStyle}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>{t("successTitle")}</h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 20px" }}>{t("successBody")}</p>
        <button type="button" onClick={() => { router.push("/dashboard"); router.refresh(); }} style={primaryButton(false)}>
          {t("continue")}
        </button>
      </div>
    );
  }

  return (
    <div className="auth-card" style={cardStyle}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>{t("resetTitle")}</h1>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 20px" }}>{t("resetSubtitle")}</p>

      {error && <div role="alert" style={noticeStyle("error")}>{error}</div>}

      <form onSubmit={save}>
        <label htmlFor="reset-email" style={labelStyle}>{t("emailLabel")}</label>
        <input id="reset-email" type="email" required autoComplete="email" placeholder={t("emailPlaceholder")} value={email} onChange={(ev) => setEmail(ev.target.value)} style={inputStyle} />

        <label htmlFor="reset-code" style={labelStyle}>{t("codeLabel")}</label>
        <input
          id="reset-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          placeholder={t("codePlaceholder")}
          value={code}
          onChange={(ev) => setCode(normalizeCode(ev.target.value))}
          style={{ ...inputStyle, letterSpacing: 4, fontSize: 18, textAlign: "center" }}
        />

        <label htmlFor="reset-new" style={labelStyle}>{t("newLabel")}</label>
        <input id="reset-new" type="password" required autoComplete="new-password" placeholder={t("newPlaceholder")} value={password} onChange={(ev) => setPassword(ev.target.value)} style={inputStyle} />

        <label htmlFor="reset-confirm" style={labelStyle}>{t("confirmLabel")}</label>
        <input id="reset-confirm" type="password" required autoComplete="new-password" placeholder={t("confirmPlaceholder")} value={confirm} onChange={(ev) => setConfirm(ev.target.value)} style={{ ...inputStyle, marginBottom: 20 }} />

        <button type="submit" className="auth-primary" disabled={loading} style={primaryButton(loading)}>
          {loading && <IconLoader2 size={18} className="spin" />}
          {loading ? t("saving") : t("savePassword")}
        </button>
      </form>

      <p style={{ fontSize: 13, textAlign: "center", margin: "20px 0 0" }}>
        <Link href="/forgot-password" style={linkStyle}>{t("newCode")}</Link>
        {" · "}
        <Link href="/auth/login" style={linkStyle}>{t("backToLogin")}</Link>
      </p>
      <div style={{ marginTop: 14, textAlign: "center" }}>
        <LanguageSwitcher />
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthSplitLayout>
      <ResetPasswordForm />
    </AuthSplitLayout>
  );
}
