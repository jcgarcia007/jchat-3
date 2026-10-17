"use client";

/**
 * JChat 3.0 — Business Verification Wizard (Task 2.2)
 * 2-step identity verification after business registration, then a manual review:
 *   Step 1 — Stripe Identity (stub poll)
 *   Step 2 — Daily code + selfie for Super Admin review
 *   Then an administrator approves the business from /super-admin/verification.
 *
 * The SMS one-time-code step is NOT part of v1 (decision 2026-10-17): /api/verify answers 410 to send_sms / verify_sms.
 *
 * Status transitions (all via /api/verify):
 *   businesses.status: 'pending_verification'
 *     → (after Step 1 approved) 'pending'         — visible on map w/ Pending badge
 *     → (admin approval)        'verified'         — payments enabled (only an admin flips it)
 *
 * Demo mode: when Supabase is not configured, UI works end-to-end with stubs.
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  IconShieldCheck,
  IconCheck,
  IconLoader2,
  IconAlertCircle,
  IconRefresh,
  IconPhoto,
  IconFingerprint,
  IconCircleCheck,
  IconChevronRight,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// ─── Types ─────────────────────────────────────────────────────────────────────

type IdentityStatus = "pending" | "approved" | "failed";
type StepStatus = "idle" | "loading" | "done" | "error";

interface StepState {
  status: StepStatus;
  error: string | null;
}

// ─── Style atoms ───────────────────────────────────────────────────────────────

const S = {
  label: {
    display: "block",
    fontSize: "12px",
    fontWeight: 600 as const,
    color: "var(--text-secondary)",
    marginBottom: "6px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
  } as React.CSSProperties,
  input: {
    width: "100%",
    boxSizing: "border-box" as const,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-subtle)",
    borderRadius: "10px",
    padding: "10px 14px",
    fontSize: "14px",
    color: "var(--text-primary)",
    outline: "none",
  } as React.CSSProperties,
  inputError: {
    border: "1px solid var(--color-danger)",
  } as React.CSSProperties,
  primaryBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "10px 20px",
    borderRadius: "10px",
    background: "var(--color-brand)",
    color: "var(--bg-surface-light)",
    border: "none",
    fontSize: "14px",
    fontWeight: 600 as const,
    cursor: "pointer",
  } as React.CSSProperties,
  ghostBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "10px 16px",
    borderRadius: "10px",
    background: "var(--bg-elevated)",
    color: "var(--text-secondary)",
    border: "1px solid var(--border-subtle)",
    fontSize: "14px",
    fontWeight: 500 as const,
    cursor: "pointer",
  } as React.CSSProperties,
  errorBox: {
    background: "color-mix(in srgb, var(--color-danger) 10%, transparent)",
    border: "1px solid var(--color-danger)",
    borderRadius: "8px",
    padding: "10px 14px",
    fontSize: "13px",
    color: "var(--color-danger)",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginTop: "12px",
  } as React.CSSProperties,
  infoBox: {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-subtle)",
    borderRadius: "10px",
    padding: "14px 16px",
    fontSize: "13px",
    color: "var(--text-secondary)",
    lineHeight: 1.6,
  } as React.CSSProperties,
};

// ─── Progress bar ──────────────────────────────────────────────────────────────

const STEPS = [
  { number: 1, label: "Identity",  icon: IconFingerprint },
  { number: 2, label: "Code + Selfie", icon: IconPhoto },
];

function StepBar({ current, completed }: { current: number; completed: Set<number> }) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: "32px", gap: 0 }}>
      {STEPS.map((s, idx) => {
        const done = completed.has(s.number);
        const active = current === s.number;
        const Icon = s.icon;
        return (
          <div
            key={s.number}
            style={{
              display: "flex",
              alignItems: "center",
              flex: idx < STEPS.length - 1 ? 1 : undefined,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {/* Circle */}
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: done
                    ? "var(--color-success)"
                    : active
                    ? "var(--color-brand)"
                    : "var(--bg-elevated)",
                  border:
                    active || done ? "none" : "1px solid var(--border-subtle)",
                  flexShrink: 0,
                  transition: "background 0.2s ease",
                }}
              >
                {done ? (
                  <IconCheck size={14} color="white" />
                ) : (
                  <Icon
                    size={14}
                    color={active ? "white" : "var(--text-tertiary)"}
                  />
                )}
              </div>
              {/* Label */}
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: active || done ? 600 : 400,
                  color: done
                    ? "var(--color-success)"
                    : active
                    ? "var(--color-brand)"
                    : "var(--text-tertiary)",
                  whiteSpace: "nowrap",
                }}
              >
                {s.label}
              </span>
            </div>
            {/* Connector line */}
            {idx < STEPS.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: "1px",
                  margin: "0 10px",
                  background: done ? "var(--color-success)" : "var(--border-subtle)",
                  transition: "background 0.2s ease",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Step 1 — Stripe Identity ──────────────────────────────────────────────────

function Step1Identity({
  businessId,
  onComplete,
}: {
  businessId: string;
  onComplete: () => void;
}) {
  const [identityStatus, setIdentityStatus] = useState<IdentityStatus>("pending");
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollStatus = useCallback(async () => {
    setPolling(true);
    setError(null);
    try {
      if (!isSupabaseConfigured) {
        // Demo mode: stub as approved immediately
        setIdentityStatus("approved");
        return;
      }
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "identity_status", business_id: businessId }),
      });
      const json = (await res.json()) as { identity_status?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to check status.");
      setIdentityStatus((json.identity_status ?? "pending") as IdentityStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setPolling(false);
    }
  }, [businessId]);

  // Auto-poll once on mount
  useEffect(() => {
    void pollStatus();
  }, [pollStatus]);

  const isApproved = identityStatus === "approved";
  const isFailed = identityStatus === "failed";

  return (
    <div>
      <div style={S.infoBox}>
        {/*
         * TODO(Stripe Identity): replace this info block with a real Stripe Identity
         * launch button. The flow is:
         *   1. Client calls POST /api/stripe-identity/session → receives client_secret
         *   2. Client loads @stripe/stripe-js and calls stripe.verifyIdentity(client_secret)
         *   3. Stripe webhook (identity.verification_session.verified) hits an Edge Function
         *      → updates business_verifications.identity_status = 'approved'
         *   4. This page polls /api/verify?action=identity_status until approved.
         */}
        <strong style={{ color: "var(--text-primary)" }}>Stripe Identity Verification</strong>
        <p style={{ margin: "8px 0 0" }}>
          We use Stripe Identity to verify you are the authorized owner of this business.
          The process typically takes a few minutes.
        </p>
        <p style={{ margin: "6px 0 0", fontSize: "12px", color: "var(--text-tertiary)" }}>
          <em>Note: Stripe Identity webhook integration is pending (TODO). Current status is read from the database.</em>
        </p>
      </div>

      {/* Status badge */}
      <div
        style={{
          marginTop: "20px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "14px 16px",
          borderRadius: "10px",
          background: isApproved
            ? "color-mix(in srgb, var(--color-success) 12%, transparent)"
            : isFailed
            ? "color-mix(in srgb, var(--color-danger) 10%, transparent)"
            : "var(--bg-elevated)",
          border: isApproved
            ? "1px solid var(--color-success)"
            : isFailed
            ? "1px solid var(--color-danger)"
            : "1px solid var(--border-subtle)",
        }}
      >
        {isApproved ? (
          <IconCircleCheck size={20} color="var(--color-success)" />
        ) : isFailed ? (
          <IconAlertCircle size={20} color="var(--color-danger)" />
        ) : (
          <IconLoader2
            size={20}
            color="var(--color-brand)"
            style={{ animation: polling ? "spin 1s linear infinite" : "none" }}
          />
        )}
        <div>
          <p
            style={{
              margin: 0,
              fontSize: "14px",
              fontWeight: 600,
              color: isApproved
                ? "var(--color-success)"
                : isFailed
                ? "var(--color-danger)"
                : "var(--text-primary)",
            }}
          >
            {isApproved
              ? "Identity Verified"
              : isFailed
              ? "Verification Failed"
              : "Verification Pending"}
          </p>
          <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--text-tertiary)" }}>
            {isApproved
              ? "Your identity has been confirmed. Continue to the next step."
              : isFailed
              ? "Please contact support at support@jchat.app to resolve this."
              : "Awaiting Stripe Identity result. This may take a few minutes."}
          </p>
        </div>
      </div>

      {error && (
        <div style={S.errorBox}>
          <IconAlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: "10px", marginTop: "20px", flexWrap: "wrap" }}>
        {!isApproved && !isFailed && (
          <button
            type="button"
            onClick={() => void pollStatus()}
            disabled={polling}
            style={{ ...S.ghostBtn, opacity: polling ? 0.6 : 1 }}
          >
            {polling ? (
              <IconLoader2 size={15} style={{ animation: "spin 1s linear infinite" }} />
            ) : (
              <IconRefresh size={15} />
            )}
            {polling ? "Checking…" : "Refresh Status"}
          </button>
        )}
        {isApproved && (
          <button type="button" onClick={onComplete} style={S.primaryBtn}>
            Continue to Step 2
            <IconChevronRight size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Step 2 — Daily Code + Selfie ─────────────────────────────────────────────

function Step2CodeSelfie({
  businessId,
  onComplete,
}: {
  businessId: string;
  onComplete: () => void;
}) {
  const tr = useTranslations("businessVerify");
  const [codeState, setCodeState] = useState<StepState>({ status: "idle", error: null });
  const [selfieState, setSelfieState] = useState<StepState>({ status: "idle", error: null });
  const [dailyCode, setDailyCode] = useState<string | null>(null);
  const [selfieUrl, setSelfieUrl] = useState("");
  const [selfieSubmitted, setSelfieSubmitted] = useState(false);

  const generateCode = useCallback(async () => {
    setCodeState({ status: "loading", error: null });
    try {
      if (!isSupabaseConfigured) {
        // Demo stub
        setDailyCode("DEMO42");
        setCodeState({ status: "done", error: null });
        return;
      }
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate_code", business_id: businessId }),
      });
      const json = (await res.json()) as { daily_code?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to generate code.");
      setDailyCode(json.daily_code ?? null);
      setCodeState({ status: "done", error: null });
    } catch (err) {
      setCodeState({ status: "error", error: err instanceof Error ? err.message : "Unknown error." });
    }
  }, [businessId]);

  // Generate code on mount
  useEffect(() => {
    void generateCode();
  }, [generateCode]);

  async function handleSelfieSubmit() {
    if (!selfieUrl.trim()) {
      setSelfieState({ status: "error", error: "Please enter a selfie URL." });
      return;
    }
    setSelfieState({ status: "loading", error: null });
    try {
      if (!isSupabaseConfigured) {
        // Demo stub
        setSelfieSubmitted(true);
        setSelfieState({ status: "done", error: null });
        return;
      }
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit_selfie",
          business_id: businessId,
          selfie_url: selfieUrl.trim(),
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to submit selfie.");
      setSelfieSubmitted(true);
      setSelfieState({ status: "done", error: null });
    } catch (err) {
      setSelfieState({ status: "error", error: err instanceof Error ? err.message : "Unknown error." });
    }
  }

  const codeReady = codeState.status === "done" && dailyCode;
  const canContinue = codeReady && selfieSubmitted;

  return (
    <div>
      {/* Daily Code section */}
      <div style={{ marginBottom: "24px" }}>
        <h3
          style={{
            fontSize: "14px",
            fontWeight: 700,
            color: "var(--text-primary)",
            margin: "0 0 8px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "20px",
              height: "20px",
              borderRadius: "50%",
              background: "var(--color-brand)",
              fontSize: "11px",
              fontWeight: 700,
              color: "var(--bg-surface-light)",
            }}
          >
            A
          </span>
          Today&apos;s Verification Code
        </h3>
        <div style={S.infoBox}>
          <p style={{ margin: "0 0 12px" }}>
            Show this code to a JChat Super Admin along with your selfie for review.
            A new code is generated each day.
          </p>
          {codeState.status === "loading" && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-secondary)" }}>
              <IconLoader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
              Generating code…
            </div>
          )}
          {codeReady && (
            <div
              style={{
                display: "inline-block",
                padding: "10px 24px",
                borderRadius: "10px",
                background: "var(--bg-base)",
                border: "2px dashed var(--color-brand)",
                fontFamily: "var(--font-mono, monospace)",
                fontSize: "28px",
                fontWeight: 700,
                color: "var(--color-brand)",
                letterSpacing: "0.25em",
              }}
            >
              {dailyCode}
            </div>
          )}
          {codeState.status === "error" && (
            <div style={S.errorBox}>
              <IconAlertCircle size={14} />
              {codeState.error}
              <button
                type="button"
                onClick={() => void generateCode()}
                style={{ marginLeft: "auto", ...S.ghostBtn, padding: "4px 10px", fontSize: "12px" }}
              >
                Retry
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Selfie section */}
      <div>
        <h3
          style={{
            fontSize: "14px",
            fontWeight: 700,
            color: "var(--text-primary)",
            margin: "0 0 8px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "20px",
              height: "20px",
              borderRadius: "50%",
              background: "var(--color-brand)",
              fontSize: "11px",
              fontWeight: 700,
              color: "var(--bg-surface-light)",
            }}
          >
            B
          </span>
          Selfie Upload
        </h3>
        {selfieSubmitted ? (
          <div
            style={{
              ...S.infoBox,
              borderColor: "var(--color-success)",
              color: "var(--color-success)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <IconCircleCheck size={16} />
            Selfie submitted for Super Admin review.
          </div>
        ) : (
          <div style={S.infoBox}>
            <p style={{ margin: "0 0 12px" }}>
              Take a selfie holding today&apos;s code on paper or screen and submit the URL below.
              Our admin team will verify your identity.
            </p>
            {/*
             * TODO(storage): replace URL input with a file upload component.
             * Implementation:
             *   1. Upload file to Supabase Storage bucket 'verification-selfies'
             *   2. Get signed URL from storage
             *   3. Pass signed URL to /api/verify { action: 'submit_selfie', selfie_url }
             */}
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <input
                style={{
                  ...S.input,
                  flex: 1,
                  minWidth: "200px",
                  ...(selfieState.status === "error" ? S.inputError : {}),
                }}
                value={selfieUrl}
                onChange={(e) => setSelfieUrl(e.target.value)}
                placeholder="https://… (paste selfie URL for now — upload coming soon)"
                type="url"
                disabled={selfieState.status === "loading"}
              />
              <button
                type="button"
                onClick={() => void handleSelfieSubmit()}
                disabled={selfieState.status === "loading" || !selfieUrl.trim()}
                style={{
                  ...S.primaryBtn,
                  opacity: selfieState.status === "loading" || !selfieUrl.trim() ? 0.6 : 1,
                  cursor: selfieState.status === "loading" ? "wait" : "pointer",
                }}
              >
                {selfieState.status === "loading" ? (
                  <IconLoader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                ) : (
                  <IconPhoto size={14} />
                )}
                {selfieState.status === "loading" ? "Submitting…" : "Submit"}
              </button>
            </div>
            {selfieState.status === "error" && selfieState.error && (
              <div style={{ ...S.errorBox, marginTop: "8px" }}>
                <IconAlertCircle size={14} />
                {selfieState.error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Continue */}
      {canContinue && (
        <div style={{ marginTop: "20px" }}>
          <button type="button" onClick={onComplete} style={S.primaryBtn}>
            {tr("sendForReview")}
            <IconChevronRight size={15} />
          </button>
        </div>
      )}

    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function BusinessVerifyPage() {
  const router = useRouter();
  const tr = useTranslations("businessVerify");
  const [currentStep, setCurrentStep] = useState(1);
  // Both steps done: nothing left for the owner, an administrator reviews the business.
  const [submitted, setSubmitted] = useState(false);
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [businessId, setBusinessId] = useState<string>("");

  // Resolve the business id from the query param set by /business/register.
  // Accepts ?id= (preferred) or ?business_id= (legacy). No placeholder — an
  // invalid value would break uuid-typed queries/Edge Functions downstream.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id") ?? params.get("business_id") ?? "";
    setBusinessId(id);

    // If Supabase is configured, read businesses.status to determine which steps
    // are already complete (allows resuming an interrupted verification).
    if (isSupabaseConfigured && id) {
      void (async () => {
        const { data } = await supabase
          .from("business_verifications")
          .select("identity_status, daily_code")
          .eq("business_id", id)
          .maybeSingle();
        if (!data) return;
        const done = new Set<number>();
        if ((data.identity_status as string) === "approved") done.add(1);
        if (data.daily_code) done.add(2);
        if (done.size > 0) {
          setCompleted(done);
          // Jump to the first incomplete step; with both done the owner only waits for the review.
          const next = [1, 2].find((s) => !done.has(s));
          if (next) setCurrentStep(next);
          else setSubmitted(true);
        }
      })();
    }
  }, []);

  function completeStep(step: number) {
    setCompleted((prev) => {
      const next = new Set(prev);
      next.add(step);
      return next;
    });
    if (step < 2) {
      setCurrentStep(step + 1);
    } else {
      // Step 2 is the last one: the owner has nothing else to do, an administrator reviews the business.
      setSubmitted(true);
    }
  }

  const stepTitles: Record<number, string> = {
    1: "Stripe Identity Verification",
    2: "Daily Code + Selfie",
  };
  const stepSubtitles: Record<number, string> = {
    1: "Confirm you are the authorized business owner",
    2: "Show your code to a Super Admin and submit a selfie",
  };

  return (
    <>
      {/* Spin keyframe — injected once */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      <div
        style={{
          minHeight: "100vh",
          background: "var(--bg-base)",
          color: "var(--text-primary)",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "40px 16px 80px",
        }}
      >
        <div style={{ width: "100%", maxWidth: "600px" }}>
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: "32px" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "52px",
                height: "52px",
                borderRadius: "14px",
                background:
                  "color-mix(in srgb, var(--color-brand) 15%, transparent)",
                marginBottom: "14px",
              }}
            >
              <IconShieldCheck size={26} color="var(--color-brand)" />
            </div>
            <h1
              style={{
                fontSize: "24px",
                fontWeight: 700,
                color: "var(--text-primary)",
                margin: "0 0 6px",
              }}
            >
              Verify your business
            </h1>
            <p style={{ fontSize: "14px", color: "var(--text-secondary)", margin: 0 }}>
              {tr("intro")}
            </p>
          </div>

          {/* Step progress bar */}
          <StepBar current={currentStep} completed={completed} />

          {/* Step card */}
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "16px",
              padding: "28px",
            }}
          >
            <h2
              style={{
                fontSize: "17px",
                fontWeight: 700,
                color: "var(--text-primary)",
                margin: "0 0 4px",
              }}
            >
              {submitted ? tr("doneTitle") : `Step ${currentStep} — ${stepTitles[currentStep]}`}
            </h2>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: "0 0 20px" }}>
              {submitted ? tr("doneSubtitle") : stepSubtitles[currentStep]}
            </p>

            {/* Both steps done: the final screen (no more steps; an admin approves from the super-admin panel). */}
            {submitted && businessId && (
              <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <IconCircleCheck size={44} color="var(--color-success)" />
                </div>
                <p style={{ fontSize: "14px", color: "var(--text-primary)", lineHeight: 1.6, margin: "12px 0 20px" }}>
                  {tr("doneMessage")}
                </p>
                <button type="button" onClick={() => router.push("/dashboard")} style={S.primaryBtn}>
                  {tr("goToDashboard")}
                  <IconChevronRight size={15} />
                </button>
              </div>
            )}

            {/* No business id in the URL — nothing to verify yet. */}
            {!businessId && (
              <div
                style={{
                  textAlign: "center",
                  padding: "24px 8px",
                  color: "var(--text-secondary)",
                  fontSize: "14px",
                }}
              >
                <p style={{ margin: "0 0 12px" }}>
                  No business selected for verification.
                </p>
                <a
                  href="/business/register"
                  style={{
                    color: "var(--color-brand)",
                    textDecoration: "none",
                    fontWeight: 600,
                  }}
                >
                  Register your business first →
                </a>
              </div>
            )}

            {/* Step content */}
            {!submitted && currentStep === 1 && businessId && (
              <Step1Identity
                businessId={businessId}
                onComplete={() => completeStep(1)}
              />
            )}
            {!submitted && currentStep === 2 && businessId && (
              <Step2CodeSelfie
                businessId={businessId}
                onComplete={() => completeStep(2)}
              />
            )}
          </div>

          {/* Already-completed steps summary */}
          {completed.size > 0 && (
            <div
              style={{
                marginTop: "16px",
                padding: "12px 16px",
                background: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "10px",
                fontSize: "12px",
                color: "var(--text-secondary)",
              }}
            >
              <strong style={{ color: "var(--text-primary)" }}>Completed:</strong>{" "}
              {[1, 2]
                .filter((s) => completed.has(s))
                .map((s) => `Step ${s} — ${stepTitles[s]}`)
                .join(" · ")}
            </div>
          )}

          {/* Footer */}
          <p
            style={{
              textAlign: "center",
              fontSize: "12px",
              color: "var(--text-tertiary)",
              marginTop: "20px",
            }}
          >
            Questions about verification?{" "}
            <a
              href="mailto:support@jchat.app"
              style={{ color: "var(--color-brand)", textDecoration: "none" }}
            >
              Contact support
            </a>
          </p>
        </div>
      </div>
    </>
  );
}
