"use client";

/**
 * JChat 3.0 — Super Admin access gate (Stage 3 cleanup).
 * Renders children only when the current user is a Super Admin (or admin role).
 * Demo mode (no Supabase) → allowed so the panel stays viewable.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { isSuperAdmin } from "@/lib/roles";

type GateState = "checking" | "allowed" | "denied";

export default function SuperAdminGate({ children }: { children: React.ReactNode }) {
  const t = useTranslations("superAdmin.gate");
  const [state, setState] = useState<GateState>("checking");

  useEffect(() => {
    let cancelled = false;
    isSuperAdmin().then((ok) => {
      if (!cancelled) setState(ok ? "allowed" : "denied");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "checking") {
    return (
      <div style={{ padding: 48, color: "var(--text-secondary)" }}>{t("checkingAccess")}</div>
    );
  }

  if (state === "denied") {
    return (
      <div style={{ padding: 48 }}>
        <h1 style={{ color: "var(--text-primary)", fontSize: 20, fontWeight: 700 }}>
          {t("accessRestrictedTitle")}
        </h1>
        <p style={{ color: "var(--text-secondary)", marginTop: 8 }}>
          {t("accessRestrictedMessage")}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
