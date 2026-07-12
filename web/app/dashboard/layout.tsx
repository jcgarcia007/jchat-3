import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { TopBar } from "@/components/dashboard/TopBar";
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
    // without a paid plan — they need it to run manual business verification
    // (/dashboard/admin/verifications). Without this, an admin with no plan would be
    // bounced to the upgrade page and could never approve a business.
    const { data: isAdmin } = await supabase.rpc("is_platform_admin");

    if (!isAdmin) {
      // Plan gate: only paying/trialing business or pro accounts may access the
      // dashboard. Anyone else is sent to register with the upgrade prompt.
      const { data: profile } = await supabase
        .from("users")
        .select("plan, plan_status")
        .eq("id", user.id)
        .single();

      const hasDashboardAccess =
        profile != null &&
        (profile.plan === "business" || profile.plan === "pro") &&
        (profile.plan_status === "active" || profile.plan_status === "trialing");

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

  return (
    <DashboardThemeProvider initialThemeId={initialThemeId}>
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
    </DashboardThemeProvider>
  );
}
