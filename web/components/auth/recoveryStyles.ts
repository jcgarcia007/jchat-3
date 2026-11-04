import type { CSSProperties } from "react";

/** Shared look of the password-recovery pages (same tokens as app/auth/login). */
export const cardStyle: CSSProperties = {
  width: "100%",
  maxWidth: 380,
  background: "var(--bg-surface)",
  border: "1px solid var(--border-subtle)",
  borderRadius: 16,
  padding: 28,
  boxShadow: "0 10px 30px var(--bg-overlay)",
};
export const labelStyle: CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 };
export const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid var(--border-subtle)",
  background: "var(--bg-base)",
  color: "var(--text-primary)",
  fontSize: 14,
  outline: "none",
  marginBottom: 14,
};
export const primaryButton = (disabled: boolean): CSSProperties => ({
  width: "100%",
  padding: "11px 16px",
  borderRadius: 10,
  border: "none",
  background: "var(--color-brand)",
  color: "var(--on-brand)",
  fontSize: 14,
  fontWeight: 600,
  cursor: disabled ? "default" : "pointer",
  opacity: disabled ? 0.6 : 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
});
export const linkStyle: CSSProperties = { color: "var(--color-brand)", fontWeight: 600, textDecoration: "none" };
export const noticeStyle = (tone: "error" | "info"): CSSProperties => ({
  padding: "10px 12px",
  marginBottom: 16,
  borderRadius: 10,
  fontSize: 13,
  background: tone === "error" ? "rgb(var(--color-danger-rgb) / 0.12)" : "var(--bg-elevated)",
  border: `1px solid ${tone === "error" ? "var(--color-danger)" : "var(--border-subtle)"}`,
});
