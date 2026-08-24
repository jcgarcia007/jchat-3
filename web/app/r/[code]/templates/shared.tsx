/**
 * shared.tsx — helpers and sub-components shared by ALL receipt templates.
 *
 * Design rules (apply in every template):
 * - All base colors come from C (hex literals, never var(--...))
 * - colorScheme:"light" on root of every template prevents browser auto-dark
 * - PaidBadge is the SINGLE source of the always-green chip — never branch it
 * - brandColor/brandText/accentColor are passed as props (computed once in dispatcher)
 */

import { IconReceipt2 } from "@tabler/icons-react";
import type { ReceiptItem } from "../page";

// ---------------------------------------------------------------------------
// Fixed palette — base colors never vary with dark mode or brand color
// ---------------------------------------------------------------------------
export const C = {
  pageBg:      "#e5e7eb",
  cardBg:      "#ffffff",
  text:        "#111827",
  textSec:     "#6b7280",
  textTer:     "#9ca3af",
  border:      "#e5e7eb",
  metaBg:      "#f9fafb",
  successBg:   "#1D9E75", // PAID — always green, never brand color
  successText: "#ffffff",
} as const;

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// PaidBadge — single source of truth; always green #1D9E75 across all templates
// ---------------------------------------------------------------------------

export function PaidBadge({ style }: { style?: React.CSSProperties }) {
  return (
    <span
      style={{
        display: "inline-block",
        background: C.successBg,
        color: C.successText,
        fontWeight: 700,
        fontSize: 12,
        letterSpacing: "0.12em",
        padding: "4px 14px",
        borderRadius: 999,
        ...style,
      }}
    >
      PAGADO
    </span>
  );
}

// ---------------------------------------------------------------------------
// ItemRow — renders one order item with modifiers and notes
// ---------------------------------------------------------------------------

export function ItemRow({ item, borderColor = C.border }: { item: ReceiptItem; borderColor?: string }) {
  return (
    <div style={{ padding: "10px 0", borderBottom: `1px solid ${borderColor}` }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: C.text }}>
            {item.qty > 1 ? `${item.qty}×  ` : ""}
            {item.name}
          </span>
          {item.options?.modifiers?.map((mod, i) => (
            <div key={i} style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>
              {mod.group_label}: {mod.choice_labels.join(", ")}
            </div>
          ))}
          {item.special_instructions && (
            <div style={{ fontSize: 12, color: C.textSec, fontStyle: "italic", marginTop: 2 }}>
              {item.special_instructions}
            </div>
          )}
        </div>
        <span style={{ fontWeight: 500, fontSize: 14, color: C.text, whiteSpace: "nowrap" }}>
          {formatCents(item.price_cents * item.qty)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TotalRow — single line in the totals section
// ---------------------------------------------------------------------------

export function TotalRow({
  label,
  value,
  bold = false,
  large = false,
  accentColor,
  labelStyle,
  valueStyle,
}: {
  label: string;
  value: string;
  bold?: boolean;
  large?: boolean;
  accentColor?: string;
  labelStyle?: React.CSSProperties;
  valueStyle?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "4px 0",
        fontWeight: bold ? 700 : 400,
        fontSize: large ? 16 : 14,
        color: C.text,
      }}
    >
      <span style={labelStyle}>{label}</span>
      <span style={{ ...(accentColor ? { color: accentColor } : {}), ...valueStyle }}>
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReceiptNotFound — shared 404 state used by the dispatcher
// ---------------------------------------------------------------------------

export function ReceiptNotFound() {
  return (
    <div
      style={{
        colorScheme: "light",
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: C.pageBg,
        padding: 24,
        textAlign: "center",
      }}
    >
      <IconReceipt2 size={48} style={{ color: C.textSec, marginBottom: 16 }} />
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: C.text }}>
        Recibo no encontrado
      </h1>
      <p style={{ color: C.textSec, maxWidth: 320 }}>
        Este enlace de recibo no es válido o ha expirado.
      </p>
    </div>
  );
}
