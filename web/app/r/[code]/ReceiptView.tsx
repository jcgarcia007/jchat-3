/**
 * ReceiptView — Server Component.
 * Renders the public digital receipt page for /r/[code].
 * No RLS: access is gated by the receipt_code itself.
 *
 * DESIGN RULE: This is a public page — never use theme tokens (var(--...)).
 * All colors are hardcoded hex so the receipt looks like paper regardless of
 * the device's light/dark mode setting. colorScheme: "light" on the root
 * container prevents the browser from applying its own dark-mode overrides.
 */

import { IconReceipt2 } from "@tabler/icons-react";
import type { PublicReceipt, ReceiptItem } from "./page";
import ReceiptPdfButton from "./ReceiptPdfButton";

// ---------------------------------------------------------------------------
// Fixed palette — no theme tokens
// ---------------------------------------------------------------------------
const C = {
  pageBg:      "#e5e7eb", // outer page background (always light gray)
  cardBg:      "#ffffff", // card background (always white)
  text:        "#111827", // primary text
  textSec:     "#6b7280", // secondary text (labels, modifiers, notes)
  textTer:     "#9ca3af", // tertiary (footer)
  border:      "#e5e7eb", // dividers and borders
  metaBg:      "#f9fafb", // meta grid background
  brand:       "#5C7CFA", // header band
  brandText:   "#ffffff", // text on brand band
  success:     "#1D9E75", // PAID badge bg
  successText: "#ffffff", // text on PAID badge
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatDate(iso: string): string {
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
// Sub-components
// ---------------------------------------------------------------------------

function ItemRow({ item }: { item: ReceiptItem }) {
  return (
    <div
      style={{
        padding: "10px 0",
        borderBottom: `1px solid ${C.border}`,
      }}
    >
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
          {/* Modifiers */}
          {item.options?.modifiers?.map((mod, i) => (
            <div
              key={i}
              style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}
            >
              {mod.group_label}: {mod.choice_labels.join(", ")}
            </div>
          ))}
          {/* Special instructions */}
          {item.special_instructions && (
            <div
              style={{
                fontSize: 12,
                color: C.textSec,
                fontStyle: "italic",
                marginTop: 2,
              }}
            >
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

function TotalRow({
  label,
  value,
  bold = false,
  large = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
  large?: boolean;
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
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Not-found fallback
// ---------------------------------------------------------------------------

function ReceiptNotFound() {
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

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface Props {
  receipt: PublicReceipt | null;
  code: string;
}

export default function ReceiptView({ receipt, code }: Props) {
  if (!receipt) return <ReceiptNotFound />;

  const { business, payment, table_label, items } = receipt;
  const total = payment.amount_cents + payment.tip_cents;

  return (
    <div
      style={{
        // Lock to light appearance — receipt looks like paper in any device mode.
        colorScheme: "light",
        minHeight: "100dvh",
        background: C.pageBg,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "32px 16px 48px",
      }}
    >
      {/* Card */}
      <div
        style={{
          background: C.cardBg,
          color: C.text,
          borderRadius: 16,
          boxShadow: "0 2px 24px rgba(0,0,0,0.10)",
          maxWidth: 480,
          width: "100%",
          overflow: "hidden",
        }}
      >
        {/* Brand header — blue band, always white text */}
        <div
          style={{
            background: C.brand,
            padding: "28px 24px 24px",
            color: C.brandText,
            textAlign: "center",
          }}
        >
          {business.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={business.logo_url}
              alt={business.name}
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                objectFit: "cover",
                margin: "0 auto 12px",
                display: "block",
                border: "3px solid rgba(255,255,255,0.4)",
              }}
            />
          )}
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: C.brandText }}>
            {business.name}
          </h1>
          {business.address && (
            <p style={{ fontSize: 13, color: C.brandText, opacity: 0.85, marginTop: 4, marginBottom: 0 }}>
              {[business.address, business.city, business.state].filter(Boolean).join(", ")}
            </p>
          )}
        </div>

        {/* PAID badge */}
        <div style={{ textAlign: "center", padding: "16px 24px 0" }}>
          <span
            style={{
              display: "inline-block",
              background: C.success,
              color: C.successText,
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: "0.12em",
              padding: "4px 14px",
              borderRadius: 999,
            }}
          >
            PAGADO
          </span>
        </div>

        {/* Meta grid */}
        <div style={{ padding: "16px 24px 0" }}>
          <div
            style={{
              background: C.metaBg,
              borderRadius: 10,
              padding: "12px 16px",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              fontSize: 13,
            }}
          >
            {table_label && (
              <>
                <span style={{ color: C.textSec }}>Mesa</span>
                <span style={{ fontWeight: 600, color: C.text, textAlign: "right" }}>{table_label}</span>
              </>
            )}
            {payment.kind === "seat" && payment.seat != null && (
              <>
                <span style={{ color: C.textSec }}>Silla</span>
                <span style={{ fontWeight: 600, color: C.text, textAlign: "right" }}>{payment.seat}</span>
              </>
            )}
            <span style={{ color: C.textSec }}>Fecha</span>
            <span style={{ fontWeight: 600, color: C.text, textAlign: "right" }}>{formatDate(payment.created_at)}</span>
            <span style={{ color: C.textSec }}>Recibo #</span>
            <span
              style={{
                fontWeight: 600,
                color: C.text,
                textAlign: "right",
                fontFamily: "monospace",
                fontSize: 11,
                wordBreak: "break-all",
              }}
            >
              {code}
            </span>
          </div>
        </div>

        {/* Items */}
        <div style={{ padding: "16px 24px 0" }}>
          <h2
            style={{
              fontSize: 13,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 4,
              color: C.textSec,
            }}
          >
            Productos
          </h2>
          {items.length === 0 ? (
            <p style={{ fontSize: 13, color: C.textSec, padding: "8px 0" }}>—</p>
          ) : (
            items.map((item, i) => <ItemRow key={i} item={item} />)
          )}
        </div>

        {/* Totals */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: `1px solid ${C.border}`,
            marginTop: 8,
          }}
        >
          <TotalRow label="Subtotal" value={formatCents(payment.subtotal_cents)} />
          <TotalRow label="Impuesto" value={formatCents(payment.tax_cents)} />
          {payment.tip_cents > 0 && (
            <TotalRow label="Propina" value={formatCents(payment.tip_cents)} />
          )}
          <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 8, paddingTop: 8 }}>
            <TotalRow label="Total" value={formatCents(total)} bold large />
          </div>
        </div>

        {/* Payment method */}
        {payment.card_brand && payment.card_last4 && (
          <div style={{ padding: "0 24px 16px", fontSize: 13, color: C.textSec }}>
            Pago:{" "}
            <strong style={{ color: C.text }}>
              {payment.card_brand.charAt(0).toUpperCase() + payment.card_brand.slice(1)}{" "}
              ••••{payment.card_last4}
            </strong>
          </div>
        )}

        {/* PDF download */}
        <div style={{ padding: "8px 24px 28px", textAlign: "center" }}>
          <ReceiptPdfButton
            receipt={receipt}
            code={code}
            label="Descargar PDF"
            generatingLabel="Generando PDF…"
          />
        </div>
      </div>

      {/* Footer */}
      <p style={{ marginTop: 24, fontSize: 12, color: C.textTer }}>
        Powered by JChat
      </p>
    </div>
  );
}
