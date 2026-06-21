import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { TopBar } from "@/components/dashboard/TopBar";
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
  }

  // TODO(Task 2.16): load dashboard_theme_id from Supabase businesses table
  // and map it to the theme key via DASHBOARD_THEMES.find(t => t.id === themeId)?.key
  const defaultThemeKey = "midnight-blue";

  return (
    <div
      data-db-theme={defaultThemeKey}
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
  );
}
