import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in — JChat",
  description: "Sign in to your JChat business dashboard",
};

/**
 * Minimal centered shell for auth pages (login, etc.).
 * Uses global Design System tokens — no dashboard theme scope here.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "var(--bg-base)",
        color: "var(--text-primary)",
      }}
    >
      {children}
    </div>
  );
}
