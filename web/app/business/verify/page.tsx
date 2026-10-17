"use client";

/**
 * JChat 3.0 — Business verification (owner side): ONE screen.
 *
 * Decision (Juan, 2026-10-17): verification in v1 = manual approval by an administrator from /super-admin/verification.
 * The owner has nothing to complete here any more (the Stripe Identity step and the daily code + selfie step were shells
 * that no real owner could finish — see /api/verify, which now answers 410 to every action):
 *   · businesses.status = 'verified'  → "Your business is already verified" + button to the dashboard
 *   · anything else                   → "We received your business, an administrator will review it" + button to the dashboard
 *
 * The status is read with the owner's own session (RLS lets an owner read their business). Nothing is written from here.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconShieldCheck, IconCircleCheck, IconClockHour4, IconLoader2, IconChevronRight } from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

type View = "loading" | "no_business" | "verified" | "in_review";

const primaryBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "6px",
  padding: "11px 22px",
  borderRadius: "10px",
  border: "none",
  background: "var(--color-brand)",
  color: "var(--bg-surface-light)",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
};

export default function BusinessVerifyPage() {
  const router = useRouter();
  const tr = useTranslations("businessVerify");
  const [view, setView] = useState<View>("loading");

  // The business id comes from the query param set by /business/register: ?id= (preferred) or ?business_id= (legacy).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id") ?? params.get("business_id") ?? "";
    if (!id) {
      setView("no_business");
      return;
    }
    if (!isSupabaseConfigured) {
      setView("in_review");
      return;
    }
    let active = true;
    void (async () => {
      const { data } = await supabase.from("businesses").select("status").eq("id", id).maybeSingle();
      if (!active) return;
      setView(data?.status === "verified" ? "verified" : "in_review");
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
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
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "52px",
              height: "52px",
              borderRadius: "14px",
              background: "color-mix(in srgb, var(--color-brand) 15%, transparent)",
              marginBottom: "14px",
            }}
          >
            <IconShieldCheck size={26} color="var(--color-brand)" />
          </div>
          <h1 style={{ fontSize: "24px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{tr("pageTitle")}</h1>
        </div>

        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "16px",
            padding: "28px",
            textAlign: "center",
          }}
        >
          {view === "loading" && (
            <div role="status" aria-label={tr("loading")} style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
              <IconLoader2 size={24} color="var(--color-brand)" style={{ animation: "spin 1s linear infinite" }} />
              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {view === "no_business" && (
            <div style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
              <p style={{ margin: "0 0 12px" }}>{tr("noBusiness")}</p>
              <a href="/business/register" style={{ color: "var(--color-brand)", textDecoration: "none", fontWeight: 600 }}>
                {tr("registerFirst")}
              </a>
            </div>
          )}

          {view === "verified" && (
            <>
              <IconCircleCheck size={44} color="var(--color-success)" />
              <h2 style={{ fontSize: "17px", fontWeight: 700, margin: "12px 0 20px" }}>{tr("verifiedTitle")}</h2>
              <button type="button" onClick={() => router.push("/dashboard")} style={primaryBtn}>
                {tr("goToDashboard")}
                <IconChevronRight size={15} />
              </button>
            </>
          )}

          {view === "in_review" && (
            <>
              <IconClockHour4 size={44} color="var(--color-brand)" />
              <p style={{ fontSize: "14px", color: "var(--text-primary)", lineHeight: 1.6, margin: "12px 0 20px" }}>
                {tr("reviewMessage")}
              </p>
              <button type="button" onClick={() => router.push("/dashboard")} style={primaryBtn}>
                {tr("goToDashboard")}
                <IconChevronRight size={15} />
              </button>
            </>
          )}
        </div>

        <p style={{ textAlign: "center", fontSize: "12px", color: "var(--text-tertiary)", marginTop: "20px" }}>
          {tr("questions")}{" "}
          <a href="mailto:support@jchat.app" style={{ color: "var(--color-brand)", textDecoration: "none" }}>
            {tr("contactSupport")}
          </a>
        </p>
      </div>
    </div>
  );
}
