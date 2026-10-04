"use client";

/**
 * JChat 3.0 — Confirm your age (18+ gate, compliance P3).
 *
 * Server layouts / the OAuth callback send here any signed-in user whose
 * users.age_confirmed_at is null (email, Google, Apple, pre-existing accounts).
 * Date input has NO default value; the Terms/Privacy checkbox is mandatory; the
 * user confirms the date before it is sent to rpc confirm_age. Only the birth
 * year is stored server-side; the full date lives in component state only.
 * Underage → neutral message (never states the age), account deleted, signed out.
 */

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { IconAlertCircle, IconLoader2 } from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { isSafeRedirectPath } from "@/lib/redirect";
import { confirmAge, deleteMyAccount } from "@/lib/account";

type Phase = "checking" | "loadError" | "form" | "confirm" | "saving" | "underage";

function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function ConfirmAgeInner() {
  const t = useTranslations("confirmAge");
  const locale = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const rawNext = params.get("next");
  const next = isSafeRedirectPath(rawNext) ? rawNext : "/dashboard";

  const [phase, setPhase] = useState<Phase>("checking");
  const [date, setDate] = useState(""); // empty until chosen — no default
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    setPhase("checking");
    if (!isSupabaseConfigured) {
      setPhase("form");
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.replace(`/auth/login?next=${encodeURIComponent(`/auth/confirm-age?next=${encodeURIComponent(next)}`)}`);
      return;
    }
    const { data, error: readErr } = await supabase
      .from("users")
      .select("age_confirmed_at")
      .eq("id", user.id)
      .maybeSingle();
    if (readErr || !data) {
      setPhase("loadError"); // fail closed
      return;
    }
    if (data.age_confirmed_at) {
      router.replace(next);
      router.refresh();
      return;
    }
    setPhase("form");
  }, [next, router]);

  useEffect(() => {
    void check();
  }, [check]);

  const prettyDate = (() => {
    if (!date) return "";
    const [y, m, d] = date.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(locale, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  })();

  async function submit() {
    setError(null);
    setPhase("saving");
    const result = await confirmAge(date);
    if (result === "ok") {
      router.replace(next);
      router.refresh();
      return;
    }
    if (result === "underage") {
      await deleteMyAccount();
      await supabase.auth.signOut();
      setPhase("underage");
      return;
    }
    setError(t("error"));
    setPhase("form");
  }

  const canContinue = date !== "" && terms;

  const card: React.CSSProperties = {
    width: "100%",
    maxWidth: 380,
    background: "var(--bg-surface)",
    border: "1px solid var(--border-subtle)",
    borderRadius: 16,
    padding: 28,
    boxShadow: "0 10px 30px var(--bg-overlay)",
  };
  const primary = (enabled: boolean): React.CSSProperties => ({
    width: "100%",
    padding: "11px 16px",
    borderRadius: 10,
    border: "none",
    background: "var(--color-brand)",
    color: "var(--on-brand)",
    fontSize: 14,
    fontWeight: 600,
    cursor: enabled ? "pointer" : "not-allowed",
    opacity: enabled ? 1 : 0.5,
  });
  const secondary: React.CSSProperties = {
    width: "100%",
    padding: "11px 16px",
    borderRadius: 10,
    border: "1px solid var(--border-subtle)",
    background: "transparent",
    color: "var(--text-primary)",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  };

  if (phase === "checking" || phase === "saving") {
    return (
      <div style={{ ...card, display: "flex", justifyContent: "center" }} role="status" aria-live="polite">
        <IconLoader2 size={22} className="spin" aria-label={t("loading")} />
      </div>
    );
  }

  if (phase === "loadError") {
    return (
      <div style={card}>
        <p role="alert" style={{ fontSize: 14, margin: "0 0 16px" }}>{t("loadError")}</p>
        <button type="button" onClick={() => void check()} style={primary(true)}>{t("retry")}</button>
      </div>
    );
  }

  if (phase === "underage") {
    return (
      <div style={card} role="alert">
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>{t("notEligibleTitle")}</h1>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 20px" }}>{t("notEligibleMessage")}</p>
        <Link href="/" style={{ color: "var(--color-brand)", fontSize: 14, fontWeight: 600 }}>{t("backHome")}</Link>
      </div>
    );
  }

  if (phase === "confirm") {
    return (
      <div style={card}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>{t("confirmTitle")}</h1>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 20px" }}>
          {t("confirmMessage", { date: prettyDate })}
        </p>
        <div style={{ display: "grid", gap: 10 }}>
          <button type="button" onClick={() => void submit()} style={primary(true)}>{t("confirmYes")}</button>
          <button type="button" onClick={() => setPhase("form")} style={secondary}>{t("confirmEdit")}</button>
        </div>
      </div>
    );
  }

  return (
    <form
      style={card}
      onSubmit={(e) => {
        e.preventDefault();
        if (canContinue) setPhase("confirm");
      }}
    >
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>{t("title")}</h1>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 20px" }}>{t("subtitle")}</p>

      {error && (
        <div
          role="alert"
          style={{
            display: "flex",
            gap: 8,
            padding: "10px 12px",
            marginBottom: 16,
            borderRadius: 10,
            background: "rgb(var(--color-danger-rgb) / 0.12)",
            border: "1px solid var(--color-danger)",
            fontSize: 13,
          }}
        >
          <IconAlertCircle size={18} style={{ flexShrink: 0, color: "var(--color-danger)" }} />
          <span>{error}</span>
        </div>
      )}

      <label
        htmlFor="dob"
        style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}
      >
        {t("dateLabel")}
      </label>
      <input
        id="dob"
        type="date"
        required
        value={date}
        max={todayIso()}
        min="1900-01-01"
        onChange={(e) => setDate(e.target.value)}
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid var(--border-subtle)",
          background: "var(--bg-base)",
          color: "var(--text-primary)",
          fontSize: 14,
          marginBottom: 18,
        }}
      />

      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, marginBottom: 22 }}>
        <input
          type="checkbox"
          checked={terms}
          onChange={(e) => setTerms(e.target.checked)}
          style={{ marginTop: 3 }}
        />
        <span style={{ color: "var(--text-secondary)" }}>
          {t("termsAgree")}{" "}
          <Link href="/terms" target="_blank" style={{ color: "var(--color-brand)", fontWeight: 600 }}>{t("terms")}</Link>
          {t("and")}
          <Link href="/privacy" target="_blank" style={{ color: "var(--color-brand)", fontWeight: 600 }}>{t("privacy")}</Link>
        </span>
      </label>

      <button type="submit" disabled={!canContinue} style={primary(canContinue)}>{t("continue")}</button>
      <button
        type="button"
        onClick={async () => {
          await supabase.auth.signOut();
          router.replace("/auth/login");
        }}
        style={{ ...secondary, marginTop: 10, border: "none", color: "var(--text-tertiary)", fontWeight: 500 }}
      >
        {t("signOut")}
      </button>
    </form>
  );
}

export default function ConfirmAgePage() {
  return (
    <Suspense fallback={null}>
      <ConfirmAgeInner />
    </Suspense>
  );
}
