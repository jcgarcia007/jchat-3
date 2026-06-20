"use client";

/**
 * JChat 3.0 — Super Admin access gate (Stage 3 cleanup).
 * Renders children only when the current user is a Super Admin (or admin role).
 * Demo mode (no Supabase) → allowed so the panel stays viewable.
 */

import { useEffect, useState } from "react";
import { isSuperAdmin } from "@/lib/roles";

type GateState = "checking" | "allowed" | "denied";

export default function SuperAdminGate({ children }: { children: React.ReactNode }) {
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
      <div style={{ padding: 48, color: "var(--text-secondary)" }}>Checking access…</div>
    );
  }

  if (state === "denied") {
    return (
      <div style={{ padding: 48 }}>
        <h1 style={{ color: "var(--text-primary)", fontSize: 20, fontWeight: 700 }}>
          Access restricted
        </h1>
        <p style={{ color: "var(--text-secondary)", marginTop: 8 }}>
          This area is limited to Super Admin and designated admin roles.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
