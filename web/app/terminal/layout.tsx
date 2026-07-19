import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  createSupabaseServerClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Terminal del mesero — JChat",
  description: "Terminal del mesero (B6)",
};

// Waiter terminal (B6.2). Lives OUTSIDE /dashboard and does NOT use the plan
// gate — an employee has no business plan. The gate here is: authenticated AND
// an ACCEPTED employee of at least one business. PIN / device linking come last
// (Juan's call); for now it's normal login.
//
// Tokens: reuse the dashboard --db-* set by fixing data-db-theme on the root
// (the tokens are defined under [data-db-theme], imported globally). The terminal
// shares the dashboard visual language, so no separate token module is needed.
export default async function TerminalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let notEmployee = false;

  if (isSupabaseConfigured) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      redirect("/auth/login?next=/terminal");
    }

    // Employee gate: accepted employee of ANY business? (RLS on employees allows
    // self-read: auth.uid() = user_id.)
    const { data: emp } = await supabase
      .from("employees")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "accepted")
      .limit(1);
    notEmployee = (emp?.length ?? 0) === 0;
  }

  return (
    <div
      data-db-theme="midnight-blue"
      style={{
        minHeight: "100vh",
        background: "var(--db-bg-base)",
        color: "var(--db-text-primary)",
      }}
    >
      {notEmployee ? <NotEmployeeScreen /> : children}
    </div>
  );
}

// Honest screen for a logged-in user who isn't an employee — NOT a 403, NOT a
// redirect to the dashboard.
function NotEmployeeScreen() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        style={{
          maxWidth: 420,
          textAlign: "center",
          background: "var(--db-bg-surface)",
          border: "1px solid var(--db-border)",
          borderRadius: 16,
          padding: "32px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 40 }}>🔒</div>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Terminal del mesero</h1>
        <p style={{ fontSize: 15, color: "var(--db-text-secondary)", margin: 0, lineHeight: 1.5 }}>
          Tu cuenta no está registrada como empleado de ningún negocio. Pídele a tu encargado que
          te añada.
        </p>
      </div>
    </div>
  );
}
