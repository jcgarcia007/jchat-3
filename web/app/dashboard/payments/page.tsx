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
  const searchParams = useSearchParams();

  const [business, setBusiness] = useState<Business | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [openingPanel, setOpeningPanel] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const showToast = useCallback((type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // ── Load the owner's business + its Stripe account status ─────────────────────
  const loadStatus = useCallback(async () => {
    setLoading(true);
    if (!isSupabaseConfigured) {
      setBusiness(null);
      setLoading(false);
      return;
    }
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setBusiness(null);
        setLoading(false);
        return;
      }
      setUserEmail(user.email ?? null);

      const { data: biz } = await supabase
        .from("businesses")
        .select("id, name")
        .eq("owner_id", user.id)
        .maybeSingle();

      if (!biz) {
        setBusiness(null);
        setLoading(false);
        return;
      }
      const b = biz as Business;
      setBusiness(b);

      const { data, error } = await supabase.functions.invoke("stripe-connect", {
        body: { action: "get_account_status", business_id: b.id },
      });
      if (error) throw error;
      setStatus(data as AccountStatus);
    } catch (err) {
      console.error("[payments] loadStatus error:", err);
      showToast("error", "No se pudo cargar el estado de Stripe.");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // ── Handle the return from Stripe onboarding (?connect=success|refresh) ───────
  useEffect(() => {
    const connect = searchParams.get("connect");
    if (!connect) return;
    if (connect === "success") showToast("success", "Verificación completada.");
    else if (connect === "refresh") showToast("error", "El enlace expiró, inténtalo de nuevo.");
    // Clean the URL so a refresh doesn't re-toast.
    const url = new URL(window.location.href);
    url.searchParams.delete("connect");
    window.history.replaceState({}, "", url.toString());
    // The real state ALWAYS comes from get_account_status, never the query param.
    void loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ── Actions ───────────────────────────────────────────────────────────────────
  const handleConnect = useCallback(async () => {
    if (!business) return;
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-connect", {
        body: {
          action: "create_connect_account",
          business_id: business.id,
          business_name: business.name,
          email: userEmail ?? undefined,
        },
      });
      if (error) throw error;
      const url = (data as { onboarding_url?: string }).onboarding_url;
      if (url) {
        window.location.href = url;
      } else {
        showToast("error", "No se recibió el enlace de onboarding.");
        setConnecting(false);
      }
    } catch (err) {
      console.error("[payments] handleConnect error:", err);
      showToast("error", "No se pudo iniciar la conexión con Stripe.");
      setConnecting(false);
    }
  }, [business, userEmail, showToast]);

  const handleOpenPanel = useCallback(async () => {
    if (!business) return;
    setOpeningPanel(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-connect", {
        body: { action: "create_login_link", business_id: business.id },
      });
      if (error) throw error;
      const url = (data as { url?: string }).url;
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      else showToast("error", "No se pudo abrir el panel de Stripe.");
    } catch (err) {
      console.error("[payments] handleOpenPanel error:", err);
      showToast("error", "No se pudo abrir el panel de Stripe.");
    } finally {
      setOpeningPanel(false);
    }
  }, [business, showToast]);

  // ── Derived state ─────────────────────────────────────────────────────────────
  const hasAccount = !!status?.account_id;
  const isActive = status?.onboarded === true;
  const isIncomplete =
    hasAccount && !isActive && (status?.details_submitted === false || status?.charges_enabled === false);

  return (
    <div>
      <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", marginBottom: "6px" }}>
        Pagos
      </h1>
      <p style={{ fontSize: "14px", color: "var(--db-text-secondary)", marginBottom: "24px" }}>
        Conecta tu cuenta de Stripe para recibir el dinero de los pedidos.
      </p>

      {!isSupabaseConfigured && (
        <AlertBanner
          icon={<IconAlertCircle size={18} />}
          message="Modo demo — conecta Supabase para gestionar tu cuenta de Stripe."
          color="var(--db-warning)"
        />
      )}

      {/* A) Loading */}
      {loading ? (
        <Card style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--db-text-secondary)" }}>
          <IconLoader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
          <span style={{ fontSize: "14px" }}>Cargando estado de pagos…</span>
        </Card>
      ) : !business ? (
        /* B) No business */
        <Card style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <IconBuildingStore size={22} style={{ color: "var(--db-text-secondary)" }} />
          <div>
            <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--db-text-primary)" }}>
              No hay un negocio asociado a esta cuenta
            </div>
            <div style={{ fontSize: "13px", color: "var(--db-text-secondary)" }}>
              Registra tu negocio para poder conectar Stripe y recibir pagos.
            </div>
          </div>
        </Card>
      ) : isActive ? (
        /* E) Active */
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
            <IconCircleCheck size={22} style={{ color: "var(--db-success)" }} />
            <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--db-text-primary)" }}>
              Conectado — recibes los pagos de tus pedidos
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
            <FlagRow label="Cobros habilitados (charges)" ok={status?.charges_enabled === true} />
            <FlagRow label="Retiros habilitados (payouts)" ok={status?.payouts_enabled === true} />
          </div>
          {status?.account_id && (
            <div style={{ fontSize: "12px", color: "var(--db-text-secondary)", marginBottom: "16px" }}>
              Cuenta: <code>{status.account_id.slice(0, 12)}…</code>
            </div>
          )}
          <PrimaryButton onClick={handleOpenPanel} loading={openingPanel} icon={<IconExternalLink size={16} />}>
            Abrir panel de Stripe
          </PrimaryButton>
        </Card>
      ) : isIncomplete ? (
        /* D) Account created, onboarding incomplete */
        <Card style={{ borderColor: "color-mix(in srgb, var(--db-warning) 40%, var(--db-border))" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
            <IconAlertCircle size={22} style={{ color: "var(--db-warning)" }} />
            <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--db-text-primary)" }}>
              Verificación pendiente — aún no puedes recibir pagos
            </div>
          </div>
          <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: "0 0 14px" }}>
            Stripe necesita más información para activar tu cuenta.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
            <FlagRow label="Datos enviados (details submitted)" ok={status?.details_submitted === true} />
            <FlagRow label="Cobros habilitados (charges)" ok={status?.charges_enabled === true} />
            <FlagRow label="Retiros habilitados (payouts)" ok={status?.payouts_enabled === true} />
          </div>
          <PrimaryButton onClick={handleConnect} loading={connecting} icon={<IconShield size={16} />}>
            Completar verificación
          </PrimaryButton>
        </Card>
      ) : (
        /* C) No Stripe account yet */
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
            <IconCreditCard size={22} style={{ color: "var(--db-accent)" }} />
            <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--db-text-primary)" }}>
              Conecta Stripe para recibir tus pagos
            </div>
          </div>
          <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: "0 0 16px", lineHeight: 1.5 }}>
            Los clientes pagan sus pedidos con tarjeta dentro de JChat. Para que el dinero
            llegue a tu cuenta, conecta tu negocio con Stripe (verificación segura de Stripe).
          </p>
          <PrimaryButton onClick={handleConnect} loading={connecting} icon={<IconCreditCard size={16} />}>
            Conectar con Stripe
          </PrimaryButton>
        </Card>
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
