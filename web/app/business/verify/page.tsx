"use client";

/**
 * JChat 3.0 — Business Verification Wizard (Task 2.2)
 * 3-step identity verification after business registration:
 *   Step 1 — Stripe Identity (stub poll)
 *   Step 2 — Daily code + selfie for Super Admin review
 *   Step 3 — SMS one-time code
 *
 * Status transitions (all via /api/verify):
 *   businesses.status: 'pending_verification'
 *     → (after Step 1 approved) 'pending'         — visible on map w/ Pending badge
 *     → (after Step 3 verified) 'verified'         — payments enabled
 *
 * Demo mode: when Supabase is not configured, UI works end-to-end with stubs.
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  IconShieldCheck,
  IconCheck,
  IconLoader2,
  IconAlertCircle,
  IconRefresh,
  IconPhoto,
  IconMessageCircle,
  IconFingerprint,
  IconLock,
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
  { number: 3, label: "Phone SMS", icon: IconMessageCircle },
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

  // Testing-only escape hatch: marks Identity approved without Stripe.
  // Hidden in real production (real Stripe Identity is used there).
  const showTestSkip =
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_ENABLE_TEST_SKIP === "true";

  const handleTestSkip = useCallback(async () => {
    setError(null);
    try {
      if (isSupabaseConfigured) {
        const { data: existing } = await supabase
          .from("business_verifications")
          .select("id")
          .eq("business_id", businessId)
          .maybeSingle();
        if (existing) {
          await supabase
            .from("business_verifications")
            .update({ identity_status: "approved" })
            .eq("business_id", businessId);
        } else {
          await supabase
            .from("business_verifications")
            .insert({ business_id: businessId, identity_status: "approved" });
        }
      }
    } catch {
      // Non-fatal in testing — still advance.
    }
    setIdentityStatus("approved");
    onComplete();
  }, [businessId, onComplete]);

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
        {showTestSkip && !isApproved && (
          <button
            type="button"
            onClick={() => void handleTestSkip()}
            style={{ ...S.ghostBtn, borderStyle: "dashed" }}
            title="Testing only — bypasses Stripe Identity"
          >
            Skip for now (Testing)
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
            Continue to Step 3
            <IconChevronRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Step 3 — SMS Verification ─────────────────────────────────────────────────

function Step3SMS({
  businessId,
  onComplete,
}: {
  businessId: string;
  onComplete: () => void;
}) {
  const [sendState, setSendState] = useState<StepState>({ status: "idle", error: null });
  const [verifyState, setVerifyState] = useState<StepState>({ status: "idle", error: null });
  const [codeSent, setCodeSent] = useState(false);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null); // shown in stub mode
  const [inputCode, setInputCode] = useState("");
  const [verified, setVerified] = useState(false);

  // Countdown timer display
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!expiresAt) return;
    const interval = setInterval(() => {
      const diff = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
      setSecondsLeft(diff);
      if (diff === 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  async function handleSendSMS() {
    setSendState({ status: "loading", error: null });
    try {
      if (!isSupabaseConfigured) {
        // Demo stub
        const fakeExpiry = new Date(Date.now() + 10 * 60 * 1000);
        setExpiresAt(fakeExpiry);
        setDevCode("123456");
        setCodeSent(true);
        setSendState({ status: "done", error: null });
        return;
      }
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send_sms", business_id: businessId }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        expires_at?: string;
        __dev_code?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Failed to send SMS.");
      setExpiresAt(json.expires_at ? new Date(json.expires_at) : null);
      setDevCode(json.__dev_code ?? null); // TODO(Twilio): remove once SMS is live
      setCodeSent(true);
      setSendState({ status: "done", error: null });
    } catch (err) {
      setSendState({ status: "error", error: err instanceof Error ? err.message : "Unknown error." });
    }
  }

  async function handleVerify() {
    if (!inputCode.trim()) {
      setVerifyState({ status: "error", error: "Please enter the 6-digit code." });
      return;
    }
    setVerifyState({ status: "loading", error: null });
    try {
      if (!isSupabaseConfigured) {
        // Demo stub: accept any code
        setVerified(true);
        setVerifyState({ status: "done", error: null });
        return;
      }
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify_sms",
          business_id: businessId,
          code: inputCode.trim(),
        }),
      });
      const json = (await res.json()) as { ok?: boolean; verified?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Verification failed.");
      setVerified(true);
      setVerifyState({ status: "done", error: null });
    } catch (err) {
      setVerifyState({
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error.",
      });
    }
  }

  const isExpired = secondsLeft === 0;
  const minutesLeft = secondsLeft !== null ? Math.floor(secondsLeft / 60) : null;
  const secsDisplay = secondsLeft !== null ? secondsLeft % 60 : null;

  return (
    <div>
      {verified ? (
        <div
          style={{
            textAlign: "center",
            padding: "32px 24px",
            background: "color-mix(in srgb, var(--color-success) 10%, transparent)",
            border: "1px solid var(--color-success)",
            borderRadius: "12px",
          }}
        >
          <IconCircleCheck size={48} color="var(--color-success)" style={{ marginBottom: "12px" }} />
          <h3
            style={{
              fontSize: "18px",
              fontWeight: 700,
              color: "var(--color-success)",
              margin: "0 0 8px",
            }}
          >
            Phone Verified!
          </h3>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)", margin: "0 0 20px" }}>
            All 3 verification steps are complete. Your business is now verified and payments
            are enabled.
          </p>
          <button type="button" onClick={onComplete} style={S.primaryBtn}>
            <IconShieldCheck size={16} />
            Complete Verification
          </button>
        </div>
      ) : (
        <>
          <div style={S.infoBox}>
            <p style={{ margin: "0 0 8px" }}>
              We&apos;ll send a 6-digit code to the phone number on your business profile.
              Enter it below to verify ownership.
            </p>
            {/*
             * TODO(Twilio): wire up real SMS sending.
             * 1. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER to env
             * 2. In /api/verify route, import twilio and send the message
             * 3. Remove __dev_code from the API response
             */}
            <p style={{ fontSize: "12px", color: "var(--text-tertiary)", margin: 0 }}>
              <em>Note: Twilio SMS integration is pending. The code is shown below in dev mode.</em>
            </p>
          </div>

          {!codeSent ? (
            <div style={{ marginTop: "16px" }}>
              <button
                type="button"
                onClick={() => void handleSendSMS()}
                disabled={sendState.status === "loading"}
                style={{
                  ...S.primaryBtn,
                  opacity: sendState.status === "loading" ? 0.6 : 1,
                  cursor: sendState.status === "loading" ? "wait" : "pointer",
                }}
              >
                {sendState.status === "loading" ? (
                  <IconLoader2 size={15} style={{ animation: "spin 1s linear infinite" }} />
                ) : (
                  <IconMessageCircle size={15} />
                )}
                {sendState.status === "loading" ? "Sending…" : "Send Verification Code"}
              </button>
              {sendState.status === "error" && sendState.error && (
                <div style={S.errorBox}>
                  <IconAlertCircle size={14} />
                  {sendState.error}
                </div>
              )}
            </div>
          ) : (
            <div style={{ marginTop: "16px" }}>
              {/* Dev code hint */}
              {devCode && (
                <div
                  style={{
                    ...S.infoBox,
                    marginBottom: "14px",
                    borderColor: "var(--color-warning)",
                    background:
                      "color-mix(in srgb, var(--color-warning) 8%, transparent)",
                  }}
                >
                  <strong style={{ color: "var(--color-warning)" }}>Dev mode:</strong> SMS not
                  sent (Twilio not configured). Your code is{" "}
                  <span
                    style={{
                      fontFamily: "var(--font-mono, monospace)",
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      letterSpacing: "0.15em",
                    }}
                  >
                    {devCode}
                  </span>
                </div>
              )}

              {/* Expiry countdown */}
              {secondsLeft !== null && !isExpired && (
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--text-secondary)",
                    marginBottom: "10px",
                  }}
                >
                  Code expires in{" "}
                  <strong style={{ color: "var(--text-primary)" }}>
                    {minutesLeft}:{String(secsDisplay).padStart(2, "0")}
                  </strong>
                </p>
              )}
              {isExpired && (
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--color-danger)",
                    marginBottom: "10px",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <IconAlertCircle size={13} /> Code expired.{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setCodeSent(false);
                      setInputCode("");
                      setSendState({ status: "idle", error: null });
                      setVerifyState({ status: "idle", error: null });
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--color-brand)",
                      cursor: "pointer",
                      padding: 0,
                      fontSize: "12px",
                    }}
                  >
                    Request a new code
                  </button>
                </p>
              )}

              {/* Code input + verify button */}
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <input
                  style={{
                    ...S.input,
                    flex: 1,
                    minWidth: "160px",
                    fontFamily: "var(--font-mono, monospace)",
                    fontSize: "20px",
                    letterSpacing: "0.2em",
                    textAlign: "center",
                    ...(verifyState.status === "error" ? S.inputError : {}),
                  }}
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                  inputMode="numeric"
                  disabled={verifyState.status === "loading" || isExpired}
                />
                <button
                  type="button"
                  onClick={() => void handleVerify()}
                  disabled={
                    verifyState.status === "loading" ||
                    inputCode.length < 6 ||
                    isExpired
                  }
                  style={{
                    ...S.primaryBtn,
                    opacity:
                      verifyState.status === "loading" ||
                      inputCode.length < 6 ||
                      isExpired
                        ? 0.6
                        : 1,
                    cursor:
                      verifyState.status === "loading" ? "wait" : "pointer",
                  }}
                >
                  {verifyState.status === "loading" ? (
                    <IconLoader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                  ) : (
                    <IconLock size={14} />
                  )}
                  {verifyState.status === "loading" ? "Verifying…" : "Verify"}
                </button>
              </div>

              {verifyState.status === "error" && verifyState.error && (
                <div style={S.errorBox}>
                  <IconAlertCircle size={14} />
                  {verifyState.error}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function BusinessVerifyPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
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
          .select("identity_status, sms_verified, daily_code")
          .eq("business_id", id)
          .maybeSingle();
        if (!data) return;
        const done = new Set<number>();
        if ((data.identity_status as string) === "approved") done.add(1);
        if (data.daily_code) done.add(2);
        if (data.sms_verified) done.add(3);
        if (done.size > 0) {
          setCompleted(done);
          // Jump to the first incomplete step
          const next = [1, 2, 3].find((s) => !done.has(s));
          if (next) setCurrentStep(next);
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
    if (step < 3) {
      setCurrentStep(step + 1);
    } else {
      // All steps done — redirect to dashboard
      router.push("/business/dashboard");
    }
  }

  const stepTitles: Record<number, string> = {
    1: "Stripe Identity Verification",
    2: "Daily Code + Selfie",
    3: "SMS Phone Verification",
  };
  const stepSubtitles: Record<number, string> = {
    1: "Confirm you are the authorized business owner",
    2: "Show your code to a Super Admin and submit a selfie",
    3: "Verify your registered business phone number",
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
              Complete all 3 steps to get verified on JChat and enable payments.
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
              Step {currentStep} — {stepTitles[currentStep]}
            </h2>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: "0 0 20px" }}>
              {stepSubtitles[currentStep]}
            </p>

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
            {currentStep === 1 && businessId && (
              <Step1Identity
                businessId={businessId}
                onComplete={() => completeStep(1)}
              />
            )}
            {currentStep === 2 && businessId && (
              <Step2CodeSelfie
                businessId={businessId}
                onComplete={() => completeStep(2)}
              />
            )}
            {currentStep === 3 && businessId && (
              <Step3SMS
                businessId={businessId}
                onComplete={() => completeStep(3)}
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
              {[1, 2, 3]
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
