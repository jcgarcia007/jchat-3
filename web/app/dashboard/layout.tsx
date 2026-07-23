import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { NewDashboardShell } from "@/components/dashboard/NewDashboardShell";
import { DashboardThemeProvider } from "@/components/dashboard/DashboardThemeProvider";
import {
  createSupabaseServerClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "JChat Dashboard",
  description: "JChat 3.0 business owner dashboard",
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Initial dashboard theme (businesses.dashboard_theme_id). Defaults to 1
  // (midnight-blue); demo mode keeps the default. The client-side
  // DashboardThemeProvider owns the live theme + data-db-theme attribute.
  let initialThemeId = 1;

  // Auth gate: require an authenticated session to access the dashboard.
  // Skipped only when Supabase is unconfigured (local/demo without a backend),
  // to avoid an unrecoverable redirect loop.
  if (isSupabaseConfigured) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      redirect("/auth/login?next=/dashboard");
    }

    // Platform admins (super_admin / admin_roles) ALWAYS have dashboard access, even
    // without a paid plan. Manual business verification lives at /super-admin/verification
    // (its own gated subtree), but admins shouldn't be bounced to the upgrade page when
    // they open the dashboard. Without this, an admin with no plan would be redirected away.
    const { data: isAdmin } = await supabase.rpc("is_platform_admin");

    if (!isAdmin) {
      // Plan gate: only paying/trialing business or pro accounts may access the
      // dashboard. Anyone else is sent to register with the upgrade prompt.
      const { data: profile } = await supabase
        .from("users")
        .select("plan, plan_status, plan_trial_end")
        .eq("id", user.id)
        .single();

      // Una prueba VENCIDA no da acceso. `plan_status` se queda en 'trialing' hasta que algo
      // lo cambie: en una suscripción de Stripe lo cambia el webhook, pero una prueba dada por
      // CÓDIGO PROMOCIONAL (D-67) no tiene suscripción detrás — sin esta comprobación el acceso
      // sería PERMANENTE. Si `plan_trial_end` es NULL no denegamos: esa prueba la gobierna
      // Stripe y Stripe moverá el estado por su cuenta (fail-open deliberado para no expulsar
      // a un cliente legítimo por un dato que no escribimos nosotros).
      const trialExpired =
        profile?.plan_status === "trialing" &&
        profile?.plan_trial_end != null &&
        new Date(profile.plan_trial_end) <= new Date();

      const hasDashboardAccess =
        profile != null &&
        (profile.plan === "business" || profile.plan === "pro") &&
        (profile.plan_status === "active" || profile.plan_status === "trialing") &&
        !trialExpired;

      if (!hasDashboardAccess) {
        redirect("/auth/register?upgrade=1");
      }
    }

    // Seed the dashboard theme from the owner's business.
    const { data: biz } = await supabase
      .from("businesses")
      .select("dashboard_theme_id")
      .eq("owner_id", user.id)
      .limit(1)
      .maybeSingle();
    initialThemeId = biz?.dashboard_theme_id ?? 1;
  }

  // Dashboard 4A rollout flag (Fase 0). Default OFF: without this env var set to
  // "true", the dashboard renders EXACTLY as before (Sidebar 48px + TopBar).
  // When "true", the new navigation (100px rail + contextual subnav, no TopBar)
  // is used instead. The auth/plan gate above runs identically on both paths.
  const useNewNav = process.env.NEXT_PUBLIC_NEW_DASHBOARD === "true";

  return (
    <DashboardThemeProvider initialThemeId={initialThemeId}>
      {useNewNav ? (
        <NewDashboardShell>{children}</NewDashboardShell>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            minHeight: "100vh",
            background: "var(--db-bg-base)",
            color: "var(--db-text-primary)",
          }}
        >
          {/* 48-px icon rail */}
          <Sidebar />

          {/* Main content column */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
              overflow: "hidden",
            }}
          >
            <TopBar />

            <main
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "24px",
              }}
            >
              {children}
            </main>
          </div>
        </div>
      )}
    </DashboardThemeProvider>
  );
}
