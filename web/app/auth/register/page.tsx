"use client";

/**
 * JChat 3.0 — Web Registration (Auth), 2-step flow mirroring the mobile app.
 * Step 1: full name, email, password (+ strength) + Google/Facebook/Apple + sign-in link.
 * Step 2: date of birth (18+), language, @username (realtime availability), terms.
 * On success → supabase.auth.signUp + users upsert → /dashboard.
 * Uses the cookie-based browser client (@/lib/supabase) so the session is
 * readable by the server-side dashboard auth gate. Visual style matches login/page.tsx.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import InvisibleCaptcha, { type InvisibleCaptchaHandle } from "@/components/InvisibleCaptcha";
import {
  IconUser,
  IconMail,
  IconLock,
  IconEye,
  IconEyeOff,
  IconAt,
  IconCheck,
  IconX,
  IconAlertCircle,
  IconLoader2,
  IconMessageCircle2,
  IconReceipt2,
  IconBrandGoogle,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { confirmAge, deleteMyAccount } from "@/lib/account";
import { useTranslations } from "next-intl";
import { authErrorKey } from "@/lib/authErrors";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import AuthSplitLayout from "@/components/auth/AuthSplitLayout";

// ── Shared styles (mirror login/page.tsx) ─────────────────────────────────────

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

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-secondary)",
  marginBottom: 6,
};

const primaryBtn: React.CSSProperties = {
  width: "100%",
  padding: "11px 16px",
  borderRadius: 10,
  border: "none",
  background: "var(--color-brand)",
  color: "var(--on-brand)",
  fontSize: 14,
  fontWeight: 600,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
};

const oauthBtn: React.CSSProperties = {
  width: "100%",
  padding: "11px 16px",
  borderRadius: 10,
  border: "1px solid var(--border-subtle)",
  background: "var(--bg-elevated)",
  color: "var(--text-primary)",
  fontSize: 14,
  fontWeight: 600,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

type Strength = { label: "weak" | "fair" | "strong"; color: string; pct: number };

function passwordStrength(pw: string): Strength | null {
  if (!pw) return null;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 2) return { label: "weak", color: "var(--color-danger)", pct: 33 };
  if (score === 3) return { label: "fair", color: "var(--color-warning)", pct: 66 };
  return { label: "strong", color: "var(--color-success)", pct: 100 };
}

function ageFromDob(dob: string): number {
  // Parse YYYY-MM-DD as a LOCAL date (new Date(str) is UTC and can be off by a day).
  const [y, mo, da] = dob.split("-").map(Number);
  const d = new Date(y, mo - 1, da);
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

type UsernameStatus = "idle" | "invalid" | "checking" | "available" | "taken";

// ── Shared card chrome ────────────────────────────────────────────────────────

function ErrorAlert({ message }: { message: string }) {
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "10px 12px",
        marginBottom: 16,
        borderRadius: 10,
        background: "rgb(var(--color-danger-rgb) / 0.12)",
        border: "1px solid var(--color-danger)",
        fontSize: 13,
      }}
    >
      <IconAlertCircle size={18} style={{ flexShrink: 0, marginTop: 1, color: "var(--color-danger)" }} />
      <span>{message}</span>
    </div>
  );
}

function CardHeader() {
  const t = useTranslations("authPages.register");
  // Both brand marks rendered; styles/brands/tabpos.css picks one by data-brand.
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
      <span
        className="auth-brand-icon"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 36,
          height: 36,
          borderRadius: 10,
          background: "var(--color-brand)",
          color: "var(--on-brand)",
        }}
      >
        <IconMessageCircle2 className="brand-jchat" size={20} />
        <IconReceipt2 className="brand-tabpos" size={20} />
      </span>
      <div>
        <div className="auth-brand-name" style={{ fontSize: 16, fontWeight: 700 }}>
          <span className="brand-jchat">JChat</span>
          <span className="brand-tabpos">Tab POS</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          <span className="brand-jchat">{t("brandSubtitle")}</span>
          <span className="brand-tabpos">{t("brandSubtitlePos")}</span>
        </div>
      </div>
    </div>
  );
}

const stepLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--color-brand)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 6,
};

// ── Step 1 ────────────────────────────────────────────────────────────────────

function RegisterStep1Form({
  fullName,
  setFullName,
  email,
  setEmail,
  password,
  setPassword,
  showPassword,
  setShowPassword,
  error,
  googleLoading,
  onGoogle,
  onContinue,
}: {
  fullName: string;
  setFullName: (s: string) => void;
  email: string;
  setEmail: (s: string) => void;
  password: string;
  setPassword: (s: string) => void;
  showPassword: boolean;
  setShowPassword: (b: boolean) => void;
  error: string | null;
  googleLoading: boolean;
  onGoogle: () => void;
  onContinue: () => void;
}) {
  const t = useTranslations("authPages.register");
  const strength = passwordStrength(password);
  const canContinue =
    fullName.trim().length > 0 && email.trim().length > 0 && password.length >= 8;

  return (
    <>
      <div className="auth-step" style={stepLabelStyle}>{t("step1")}</div>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>
        {t("createTitle")}
      </h1>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 20px" }}>
        <span className="brand-jchat">{t("joinJchat")}</span>
        <span className="brand-tabpos">{t("joinTabpos")}</span>
      </p>

      {error && <ErrorAlert message={error} />}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canContinue) onContinue();
        }}
      >
        {/* Full name */}
        <label style={labelStyle}>{t("fullName")}</label>
        <div style={{ position: "relative", marginBottom: 14 }}>
          <span style={iconWrap}>
            <IconUser size={18} />
          </span>
          <input
            type="text"
            required
            autoComplete="name"
            placeholder={t("fullNamePlaceholder")}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* Email */}
        <label style={labelStyle}>{t("email")}</label>
        <div style={{ position: "relative", marginBottom: 14 }}>
          <span style={iconWrap}>
            <IconMail size={18} />
          </span>
          <input
            type="email"
            required
            autoComplete="email"
            placeholder={t("emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* Password */}
        <label style={labelStyle}>{t("password")}</label>
        <div style={{ position: "relative", marginBottom: 8 }}>
          <span style={iconWrap}>
            <IconLock size={18} />
          </span>
          <input
            type={showPassword ? "text" : "password"}
            required
            autoComplete="new-password"
            minLength={8}
            placeholder={t("passwordPlaceholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ ...inputStyle, paddingRight: 40 }}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? t("hidePassword") : t("showPassword")}
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              padding: 4,
              cursor: "pointer",
              color: "var(--text-tertiary)",
              display: "flex",
            }}
          >
            {showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
          </button>
        </div>

        {/* Strength indicator */}
        {strength && (
          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                height: 4,
                borderRadius: 999,
                background: "var(--border-subtle)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: "100%",
                  background: strength.color,
                  transformOrigin: "left",
                  transform: `scaleX(${strength.pct / 100})`,
                  transition: "transform 0.2s ease",
                }}
              />
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: strength.color,
                marginTop: 4,
                textTransform: "capitalize",
              }}
            >
              {t(`strength.${strength.label}`)}
            </div>
          </div>
        )}
        {!strength && <div style={{ marginBottom: 20 }} />}

        <button
          type="submit"
          className="auth-primary"
          disabled={!canContinue}
          style={{
            ...primaryBtn,
            cursor: canContinue ? "pointer" : "default",
            opacity: canContinue ? 1 : 0.6,
          }}
        >
          {t("continue")}
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
        {t("or")}
        <span style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
      </div>

      {/* Google */}
      <button
        type="button"
        className="auth-oauth"
        onClick={onGoogle}
        disabled={googleLoading}
        style={{
          ...oauthBtn,
          cursor: googleLoading ? "default" : "pointer",
          opacity: googleLoading ? 0.7 : 1,
        }}
      >
        {googleLoading ? (
          <IconLoader2 size={18} className="spin" />
        ) : (
          <IconBrandGoogle size={18} />
        )}
        {t("google")}
      </button>

      {/* Sign in link */}
      <p
        style={{
          fontSize: 13,
          color: "var(--text-secondary)",
          textAlign: "center",
          margin: "20px 0 0",
        }}
      >
        {t("haveAccount")}{" "}
        <a href="/auth/login" style={{ color: "var(--color-brand)", fontWeight: 600 }}>
          {t("signIn")}
        </a>
      </p>
    </>
  );
}

// ── Step 2 ────────────────────────────────────────────────────────────────────

function RegisterStep2Form({
  dob,
  setDob,
  language,
  setLanguage,
  username,
  setUsername,
  usernameStatus,
  agreeTerms,
  setAgreeTerms,
  error,
  loading,
  onCreate,
  onBack,
}: {
  dob: string;
  setDob: (s: string) => void;
  language: string;
  setLanguage: (s: string) => void;
  username: string;
  setUsername: (s: string) => void;
  usernameStatus: UsernameStatus;
  agreeTerms: boolean;
  setAgreeTerms: (b: boolean) => void;
  error: string | null;
  loading: boolean;
  onCreate: () => void;
  onBack: () => void;
}) {
  const te = useTranslations("authErrors");
  const t = useTranslations("authPages.register");
  const is18 = dob !== "" && ageFromDob(dob) >= 18;
  const usernameOk = usernameStatus === "available" && username.length >= 3;
  const canCreate = is18 && usernameOk && agreeTerms && !loading;

  return (
    <>
      <div className="auth-step" style={stepLabelStyle}>{t("step2")}</div>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>{t("almostThere")}</h1>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 20px" }}>
        {t("step2Subtitle")}
      </p>

      {error && <ErrorAlert message={error} />}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canCreate) onCreate();
        }}
      >
        {/* Date of birth */}
        <label style={labelStyle}>{t("dob")}</label>
        <div style={{ marginBottom: dob !== "" && !is18 ? 6 : 14 }}>
          <input
            type="date"
            required
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            style={{ ...inputStyle, padding: "10px 12px" }}
          />
        </div>
        {dob !== "" && !is18 && (
          <div style={{ fontSize: 11, color: "var(--color-danger)", marginBottom: 14 }}>
            {te("notEligible")}
          </div>
        )}

        {/* Language */}
        <label style={labelStyle}>{t("language")}</label>
        <div style={{ marginBottom: 14 }}>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            style={{ ...inputStyle, padding: "10px 12px", cursor: "pointer" }}
          >
            <option value="en">{t("languageEnglish")}</option>
            <option value="es">{t("languageSpanish")}</option>
          </select>
        </div>

        {/* Username */}
        <label style={labelStyle}>{t("username")}</label>
        <div style={{ position: "relative", marginBottom: 6 }}>
          <span style={{ ...iconWrap, color: "var(--text-secondary)", fontWeight: 600 }}>
            <IconAt size={18} />
          </span>
          <input
            type="text"
            required
            autoComplete="username"
            placeholder={t("usernamePlaceholder")}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ ...inputStyle, paddingRight: 40 }}
          />
          <span
            style={{
              position: "absolute",
              right: 12,
              top: "50%",
              transform: "translateY(-50%)",
              display: "flex",
            }}
          >
            {usernameStatus === "checking" && (
              <IconLoader2 size={18} className="spin" style={{ color: "var(--text-tertiary)" }} />
            )}
            {usernameStatus === "available" && (
              <IconCheck size={18} style={{ color: "var(--color-success)" }} />
            )}
            {usernameStatus === "taken" && (
              <IconX size={18} style={{ color: "var(--color-danger)" }} />
            )}
          </span>
        </div>
        <div
          style={{
            fontSize: 11,
            marginBottom: 16,
            color:
              usernameStatus === "taken" || usernameStatus === "invalid"
                ? "var(--color-danger)"
                : usernameStatus === "available"
                  ? "var(--color-success)"
                  : "var(--text-tertiary)",
          }}
        >
          {usernameStatus === "invalid"
            ? t("usernameInvalid")
            : usernameStatus === "taken"
              ? t("usernameTaken")
              : usernameStatus === "available"
                ? t("usernameAvailable")
                : t("usernameHint")}
        </div>

        {/* Terms */}
        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            marginBottom: 20,
            fontSize: 13,
            color: "var(--text-secondary)",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={agreeTerms}
            onChange={(e) => setAgreeTerms(e.target.checked)}
            style={{ marginTop: 2, cursor: "pointer", flexShrink: 0 }}
          />
          <span>
            {t("agreePrefix")}{" "}
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--color-brand)", fontWeight: 600 }}
            >
              {t("terms")}
            </a>{" "}
            {t("and")}{" "}
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--color-brand)", fontWeight: 600 }}
            >
              {t("privacy")}
            </a>
            .
          </span>
        </label>

        <button
          type="submit"
          className="auth-primary"
          disabled={!canCreate}
          style={{
            ...primaryBtn,
            cursor: canCreate ? "pointer" : "default",
            opacity: canCreate ? 1 : 0.6,
          }}
        >
          {loading && <IconLoader2 size={18} className="spin" />}
          {loading ? t("creating") : t("create")}
        </button>
      </form>

      <button
        type="button"
        onClick={onBack}
        disabled={loading}
        style={{
          width: "100%",
          marginTop: 12,
          padding: "8px 16px",
          borderRadius: 10,
          border: "none",
          background: "none",
          color: "var(--text-secondary)",
          fontSize: 13,
          fontWeight: 600,
          cursor: loading ? "default" : "pointer",
        }}
      >
        {t("back")}
      </button>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const te = useTranslations("authErrors");
  const router = useRouter();

  const [step, setStep] = useState<1 | 2>(1);

  // Step 1 fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Step 2 fields
  const [dob, setDob] = useState("");
  const [language, setLanguage] = useState("en");
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const [agreeTerms, setAgreeTerms] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  // hCaptcha (D-38): token pedido en el submit; el widget se monta abajo.
  const captchaRef = useRef<InvisibleCaptchaHandle>(null);

  // Sanitize username: lowercase, only [a-z0-9_], max 30.
  function handleUsernameChange(v: string) {
    setUsername(v.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30));
  }

  // Realtime availability (debounced 300ms).
  useEffect(() => {
    if (username.length === 0) {
      setUsernameStatus("idle");
      return;
    }
    if (username.length < 3) {
      setUsernameStatus("invalid");
      return;
    }
    if (!isSupabaseConfigured) {
      setUsernameStatus("idle");
      return;
    }
    setUsernameStatus("checking");
    const t = setTimeout(async () => {
      const { data, error: rpcErr } = await supabase.rpc("username_available", {
        check_username: username,
      });
      if (rpcErr) {
        setUsernameStatus("idle");
        return;
      }
      setUsernameStatus(data === true ? "available" : "taken");
    }, 300);
    return () => clearTimeout(t);
  }, [username]);

  function goToStep2() {
    setError(null);
    setStep(2);
  }

  function backToStep1() {
    setError(null);
    setStep(1);
  }

  async function handleGoogleSignup() {
    setError(null);
    if (!isSupabaseConfigured) {
      setError(te("notConfigured"));
      return;
    }
    setGoogleLoading(true);
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/auth/welcome")}`,
      },
    });
    // On success the browser is redirected to Google, so we only reach here on error.
    if (oauthErr) {
      setGoogleLoading(false);
      setError(te(authErrorKey(oauthErr)));
    }
  }

  async function handleCreateAccount() {
    setError(null);
    if (!isSupabaseConfigured) {
      setError(te("notConfigured"));
      return;
    }

    setLoading(true);

    // hCaptcha (D-38): token de un solo uso justo antes del signUp; getToken() resetea el
    // widget tras consumirlo. Reto fallido/cancelado con captcha activado → abortar; kill-
    // switch (desactivado) → proceder sin token.
    const captcha = (await captchaRef.current?.getToken()) ?? { status: "disabled" as const };
    if (captcha.status === "failed") {
      setError(te("captchaFailed"));
      setLoading(false);
      return;
    }
    const captchaToken = captcha.status === "ok" ? captcha.token : undefined;

    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        captchaToken,
        // When email confirmation is ON, the link lands on the same PKCE callback
        // used by Google OAuth (exchangeCodeForSession) → /auth/welcome.
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/auth/welcome")}`,
      },
    });

    if (signUpErr) {
      setLoading(false);
      setError(te(authErrorKey(signUpErr)));
      return;
    }

    const userId = signUpData.user?.id;
    if (!userId) {
      setLoading(false);
      setError(te("noSession"));
      return;
    }

    // 18+ (server-side): the DOB already asked here goes to confirm_age right after the
    // session exists. Only the birth year is stored; the full date is never persisted.
    // No session yet (email confirmation ON) → the age gate asks at first sign-in.
    if (signUpData.session) {
      const ageResult = await confirmAge(dob);
      if (ageResult === "underage") {
        await deleteMyAccount();
        await supabase.auth.signOut({ scope: "local" });
        setLoading(false);
        setError(te("notEligible"));
        return;
      }
      // "error": the account exists without confirmation → the gate will ask next time.
    }

    // The handle_new_auth_user trigger already created the row, with a username
    // DERIVED from the email — not the one the user chose here. Apply the user's
    // actual choices with an UPDATE. No `id` in the payload → respects the users
    // column allow-list (migr 066): id is in the WHERE, not the SET.
    const { error: upsertErr } = await supabase
      .from("users")
      .update({
        username,
        display_name: fullName.trim(),
        language,
      })
      .eq("id", userId);

    if (upsertErr) {
      // Surfaced below: a unique violation means the chosen username is taken —
      // the user sees the error instead of silently keeping the derived one.
      setLoading(false);
      setError(upsertErr.code === "23505" ? te("usernameTaken") : te("generic"));
      return;
    }

    // A la bienvenida, NO al panel: un usuario nuevo es `regular` y el gate del
    // dashboard lo rebotaría de vuelta aquí (bucle). La bienvenida decide si
    // corresponde ofrecer Business/Pro o mandarlo directo al panel.
    router.push("/auth/welcome");
    router.refresh();
  }

  return (
    <AuthSplitLayout>
    <div
      className="auth-card"
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
      <CardHeader />

      {step === 1 ? (
        <RegisterStep1Form
          fullName={fullName}
          setFullName={setFullName}
          email={email}
          setEmail={setEmail}
          password={password}
          setPassword={setPassword}
          showPassword={showPassword}
          setShowPassword={setShowPassword}
          error={error}
          googleLoading={googleLoading}
          onGoogle={handleGoogleSignup}
          onContinue={goToStep2}
        />
      ) : (
        <RegisterStep2Form
          dob={dob}
          setDob={setDob}
          language={language}
          setLanguage={setLanguage}
          username={username}
          setUsername={handleUsernameChange}
          usernameStatus={usernameStatus}
          agreeTerms={agreeTerms}
          setAgreeTerms={setAgreeTerms}
          error={error}
          loading={loading}
          onCreate={handleCreateAccount}
          onBack={backToStep1}
        />
      )}

      <div style={{ marginTop: 14, textAlign: "center" }}>
        <LanguageSwitcher />
      </div>

      {/* hCaptcha invisible (D-38): sin UI salvo cuando el reto se dispara. Una sola
          instancia para ambos steps; el submit real (signUp) ocurre en el step 2. */}
      <InvisibleCaptcha ref={captchaRef} />
    </div>
    </AuthSplitLayout>
  );
}
