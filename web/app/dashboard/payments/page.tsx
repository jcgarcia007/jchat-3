/**
 * JChat 3.0 — Payments Dashboard (Stripe Connect onboarding, Task 3.6)
 *
 * Lets a business owner connect their Stripe account so they RECEIVE the money
 * from order payments. All Stripe work happens in the `stripe-connect` Edge
 * Function (JWT + business ownership verified server-side); this page only calls
 * its three actions and reflects the real state from get_account_status.
 *
 * Design tokens: var(--db-*) only — mirrors billing/page.tsx. Icons: Tabler only.
 */

"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  IconAlertCircle,
  IconBuildingStore,
  IconCheck,
  IconCircleCheck,
  IconCreditCard,
  IconExternalLink,
  IconLoader2,
  IconShield,
  IconX,
} from "@tabler/icons-react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Business {
  id: string;
  name: string;
}

interface AccountStatus {
  onboarded: boolean;
  details_submitted?: boolean;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  account_id: string | null;
}

// ── Small presentational helpers (mirror billing/page.tsx) ──────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: "var(--db-bg-surface)",
        border: "1px solid var(--db-border)",
        borderRadius: "12px",
        padding: "20px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function AlertBanner({ icon, message, color }: { icon: React.ReactNode; message: string; color: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "12px 16px",
        borderRadius: "10px",
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
        color,
        fontSize: "13px",
        fontWeight: 500,
        marginBottom: "20px",
      }}
    >
      {icon}
      <span>{message}</span>
    </div>
  );
}

function FlagRow({ label, ok }: { label: string; ok: boolean }) {
  const color = ok ? "var(--db-success)" : "var(--db-danger)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--db-text-primary)" }}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: `color-mix(in srgb, ${color} 15%, transparent)`,
          color,
          flexShrink: 0,
        }}
      >
        {ok ? <IconCheck size={12} /> : <IconX size={12} />}
      </span>
      {label}
    </div>
  );
}

function PrimaryButton({
  onClick,
  loading,
  disabled,
  icon,
  children,
}: {
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const off = loading || disabled;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={off}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        padding: "10px 18px",
        borderRadius: "10px",
        border: "none",
        background: "var(--db-accent)",
        color: "var(--db-accent-text)",
        fontSize: "14px",
        fontWeight: 600,
        cursor: off ? "default" : "pointer",
        opacity: off ? 0.6 : 1,
      }}
    >
      {loading ? <IconLoader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : icon}
      {children}
    </button>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────────

function PaymentsInner() {
  const t = useTranslations("dashboardCommon");
  const tCommon = useTranslations("common");
  const searchParams = useSearchParams();

  // An owner can have several businesses (Pro plan: up to 10). Each needs its OWN
  // Stripe account, so we list them all and let the user pick which to connect.
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [loading, setLoading] = useState(true); // initial businesses load
  const [statusLoading, setStatusLoading] = useState(false); // per-business status
  const [connecting, setConnecting] = useState(false);
  const [openingPanel, setOpeningPanel] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const selectedBusiness = businesses.find((b) => b.id === selectedBusinessId) ?? null;

  const showToast = useCallback((type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // ── Load ALL of the owner's businesses (no maybeSingle: an owner can have many) ─
  const loadBusinesses = useCallback(async () => {
    setLoading(true);
    if (!isSupabaseConfigured) {
      setBusinesses([]);
      setLoading(false);
      return;
    }
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setBusinesses([]);
        setLoading(false);
        return;
      }
      setUserEmail(user.email ?? null);

      const { data, error } = await supabase
        .from("businesses")
        .select("id, name")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: true });
      if (error) throw error;

      const list = (data as Business[] | null) ?? [];
      setBusinesses(list);
      if (list.length > 0) {
        // Preselect the business the onboarding link came back with, else the first.
        const fromQuery = searchParams.get("business_id");
        const initial = fromQuery && list.some((b) => b.id === fromQuery) ? fromQuery : list[0].id;
        setSelectedBusinessId(initial);
      }
    } catch (err) {
      console.error("[payments] loadBusinesses error:", err);
      showToast("error", t("paymentsLoadBusinessesError"));
    } finally {
      setLoading(false);
    }
  }, [searchParams, showToast, t]);

  useEffect(() => {
    void loadBusinesses();
  }, [loadBusinesses]);

  // ── Load the Stripe account status for a given business ───────────────────────
  const loadStatus = useCallback(
    async (businessId: string) => {
      setStatus(null); // reset so we never show the previous business's state
      setStatusLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("stripe-connect", {
          body: { action: "get_account_status", business_id: businessId },
        });
        if (error) throw error;
        setStatus(data as AccountStatus);
      } catch (err) {
        console.error("[payments] loadStatus error:", err);
        showToast("error", t("paymentsLoadStatusError"));
      } finally {
        setStatusLoading(false);
      }
    },
    [showToast, t],
  );

  // Reload status whenever the selected business changes.
  useEffect(() => {
    if (!isSupabaseConfigured || !selectedBusinessId) return;
    void loadStatus(selectedBusinessId);
  }, [selectedBusinessId, loadStatus]);

  // ── Handle the return from Stripe onboarding (?connect=success|refresh) ───────
  useEffect(() => {
    const connect = searchParams.get("connect");
    if (!connect) return;
    if (connect === "success") showToast("success", t("paymentsVerificationCompleteToast"));
    else if (connect === "refresh") showToast("error", t("paymentsLinkExpiredToast"));
    // Clean the URL so a refresh doesn't re-toast (keep business_id for preselection).
    const url = new URL(window.location.href);
    url.searchParams.delete("connect");
    window.history.replaceState({}, "", url.toString());
    // Real state ALWAYS comes from get_account_status (the effect above reloads it for
    // the selected business); never trust the query param.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ── Actions ───────────────────────────────────────────────────────────────────
  const handleConnect = useCallback(async () => {
    if (!selectedBusiness) return;
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-connect", {
        body: {
          action: "create_connect_account",
          business_id: selectedBusiness.id,
          business_name: selectedBusiness.name,
          email: userEmail ?? undefined,
        },
      });
      if (error) throw error;
      const url = (data as { onboarding_url?: string }).onboarding_url;
      if (url) {
        window.location.href = url;
      } else {
        showToast("error", t("paymentsNoOnboardingLinkError"));
        setConnecting(false);
      }
    } catch (err) {
      console.error("[payments] handleConnect error:", err);
      showToast("error", t("paymentsConnectError"));
      setConnecting(false);
    }
  }, [selectedBusiness, userEmail, showToast, t]);

  const handleOpenPanel = useCallback(async () => {
    if (!selectedBusinessId) return;
    setOpeningPanel(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-connect", {
        body: { action: "create_login_link", business_id: selectedBusinessId },
      });
      if (error) throw error;
      const url = (data as { url?: string }).url;
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      else showToast("error", t("paymentsOpenPanelError"));
    } catch (err) {
      console.error("[payments] handleOpenPanel error:", err);
      showToast("error", t("paymentsOpenPanelError"));
    } finally {
      setOpeningPanel(false);
    }
  }, [selectedBusinessId, showToast, t]);

  // ── Derived state ─────────────────────────────────────────────────────────────
  const hasAccount = !!status?.account_id;
  const isActive = status?.onboarded === true;
  const isIncomplete =
    hasAccount && !isActive && (status?.details_submitted === false || status?.charges_enabled === false);

  return (
    <div>
      <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", marginBottom: "6px" }}>
        {t("railPagos")}
      </h1>
      <p style={{ fontSize: "14px", color: "var(--db-text-secondary)", marginBottom: "24px" }}>
        {t("paymentsSubtitle")}
      </p>

      {!isSupabaseConfigured && (
        <AlertBanner
          icon={<IconAlertCircle size={18} />}
          message={t("paymentsDemoModeMessage")}
          color="var(--db-warning)"
        />
      )}

      {/* A) Loading (initial businesses fetch) */}
      {loading ? (
        <Card style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--db-text-secondary)" }}>
          <IconLoader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
          <span style={{ fontSize: "14px" }}>{tCommon("loading")}</span>
        </Card>
      ) : businesses.length === 0 ? (
        /* B) No business */
        <Card style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <IconBuildingStore size={22} style={{ color: "var(--db-text-secondary)" }} />
          <div>
            <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--db-text-primary)" }}>
              {t("paymentsNoBusinessTitle")}
            </div>
            <div style={{ fontSize: "13px", color: "var(--db-text-secondary)" }}>
              {t("paymentsNoBusinessMessage")}
            </div>
          </div>
        </Card>
      ) : (
        <>
          {/* Business selector — only when the owner has more than one */}
          {businesses.length > 1 && (
            <div style={{ marginBottom: "16px" }}>
              <label
                htmlFor="payments-business"
                style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--db-text-secondary)", marginBottom: "6px" }}
              >
                {t("createBusinessCardTitle")}
              </label>
              <select
                id="payments-business"
                value={selectedBusinessId ?? ""}
                onChange={(e) => setSelectedBusinessId(e.target.value)}
                style={{
                  width: "100%",
                  maxWidth: "360px",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  border: "1px solid var(--db-border)",
                  background: "var(--db-bg-surface)",
                  color: "var(--db-text-primary)",
                  fontSize: "14px",
                }}
              >
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Status card for the SELECTED business */}
          {statusLoading || !status ? (
            <Card style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--db-text-secondary)" }}>
              <IconLoader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
              <span style={{ fontSize: "14px" }}>{t("paymentsLoadingStatus")}</span>
            </Card>
          ) : isActive ? (
        /* E) Active */
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
            <IconCircleCheck size={22} style={{ color: "var(--db-success)" }} />
            <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--db-text-primary)" }}>
              {t("paymentsActiveTitle")}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
            <FlagRow label={t("paymentsChargesEnabledLabel")} ok={status?.charges_enabled === true} />
            <FlagRow label={t("paymentsPayoutsEnabledLabel")} ok={status?.payouts_enabled === true} />
          </div>
          {status?.account_id && (
            <div style={{ fontSize: "12px", color: "var(--db-text-secondary)", marginBottom: "16px" }}>
              {t("paymentsAccountLabel")} <code>{status.account_id.slice(0, 12)}…</code>
            </div>
          )}
          <PrimaryButton onClick={handleOpenPanel} loading={openingPanel} icon={<IconExternalLink size={16} />}>
            {t("paymentsOpenPanelButton")}
          </PrimaryButton>
        </Card>
      ) : isIncomplete ? (
        /* D) Account created, onboarding incomplete */
        <Card style={{ borderColor: "color-mix(in srgb, var(--db-warning) 40%, var(--db-border))" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
            <IconAlertCircle size={22} style={{ color: "var(--db-warning)" }} />
            <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--db-text-primary)" }}>
              {t("paymentsIncompleteTitle")}
            </div>
          </div>
          <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: "0 0 14px" }}>
            {t("paymentsIncompleteMessage")}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
            <FlagRow label={t("paymentsDetailsSubmittedLabel")} ok={status?.details_submitted === true} />
            <FlagRow label={t("paymentsChargesEnabledLabel")} ok={status?.charges_enabled === true} />
            <FlagRow label={t("paymentsPayoutsEnabledLabel")} ok={status?.payouts_enabled === true} />
          </div>
          <PrimaryButton onClick={handleConnect} loading={connecting} icon={<IconShield size={16} />}>
            {t("paymentsCompleteVerificationButton")}
          </PrimaryButton>
        </Card>
      ) : (
        /* C) No Stripe account yet */
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
            <IconCreditCard size={22} style={{ color: "var(--db-accent)" }} />
            <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--db-text-primary)" }}>
              {t("paymentsNoAccountTitle")}
            </div>
          </div>
          <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: "0 0 16px", lineHeight: 1.5 }}>
            {t("paymentsNoAccountMessage")}
          </p>
          <PrimaryButton onClick={handleConnect} loading={connecting} icon={<IconCreditCard size={16} />}>
            {t("paymentsConnectButton")}
          </PrimaryButton>
        </Card>
          )}
        </>
      )}

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "12px 18px",
            borderRadius: "10px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.35)",
            background: toast.type === "success" ? "var(--db-success)" : "var(--db-danger)",
            color: "var(--db-accent-text)",
            fontSize: "13px",
            fontWeight: 500,
            maxWidth: "400px",
          }}
        >
          {toast.type === "success" ? <IconCircleCheck size={16} /> : <IconAlertCircle size={16} />}
          {toast.msg}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function PaymentsPage() {
  return (
    <Suspense fallback={null}>
      <PaymentsInner />
    </Suspense>
  );
}
