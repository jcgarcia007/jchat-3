/**
 * ReceiptView — Server Component.
 * Renders the public digital receipt page for /r/[code].
 * No RLS: access is gated by the receipt_code itself.
 *
 * Design: dark outer background, centered white card, tokens only (no hex).
 */

import { IconReceipt2 } from "@tabler/icons-react";
import type { PublicReceipt, ReceiptItem } from "./page";
import ReceiptPdfButton from "./ReceiptPdfButton";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCents(cents: number, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatDate(iso: string, locale = "en-US"): string {
  try {
    return new Date(iso).toLocaleString(locale, {
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

function ItemRow({ item }: { item: ReceiptItem }) {
  return (
    <div
      style={{
        padding: "10px 0",
        borderBottom: "1px solid var(--color-border, #e5e7eb)",
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
          <span style={{ fontWeight: 600, fontSize: 14 }}>
            {item.qty > 1 ? `${item.qty}×  ` : ""}
            {item.name}
          </span>
          {/* Modifiers */}
          {item.options?.modifiers?.map((mod, i) => (
            <div
              key={i}
              style={{
                fontSize: 12,
                color: "var(--color-text-secondary, #6b7280)",
                marginTop: 2,
              }}
            >
              {mod.group_label}: {mod.choice_labels.join(", ")}
            </div>
          ))}
          {/* Special instructions */}
          {item.special_instructions && (
            <div
              style={{
                fontSize: 12,
                color: "var(--color-text-secondary, #6b7280)",
                fontStyle: "italic",
                marginTop: 2,
              }}
            >
              {item.special_instructions}
            </div>
          )}
        </div>
        <span style={{ fontWeight: 500, fontSize: 14, whiteSpace: "nowrap" }}>
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
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-surface, #f3f4f6)",
        padding: 24,
        textAlign: "center",
      }}
    >
      <IconReceipt2 size={48} style={{ color: "var(--color-text-secondary, #9ca3af)", marginBottom: 16 }} />
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
        Receipt not found
      </h1>
      <p style={{ color: "var(--color-text-secondary, #6b7280)", maxWidth: 320 }}>
        This receipt link is invalid or has expired.
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
        minHeight: "100dvh",
        background: "var(--color-surface, #f3f4f6)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "32px 16px 48px",
      }}
    >
      {/* Card */}
      <div
        style={{
          background: "var(--color-surface-raised, #ffffff)",
          borderRadius: 16,
          boxShadow: "0 2px 24px rgba(0,0,0,0.10)",
          maxWidth: 480,
          width: "100%",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            background: "var(--color-brand, #5C7CFA)",
            padding: "28px 24px 24px",
            color: "#fff",
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
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{business.name}</h1>
          {business.address && (
            <p style={{ fontSize: 13, opacity: 0.85, marginTop: 4, marginBottom: 0 }}>
              {[business.address, business.city, business.state].filter(Boolean).join(", ")}
            </p>
          )}
        </div>

        {/* PAID badge */}
        <div style={{ textAlign: "center", padding: "16px 24px 0" }}>
          <span
            style={{
              display: "inline-block",
              background: "var(--color-success, #1D9E75)",
              color: "#fff",
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

        {/* Meta */}
        <div style={{ padding: "16px 24px 0" }}>
          <div
            style={{
              background: "var(--color-surface, #f9fafb)",
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
                <span style={{ color: "var(--color-text-secondary, #6b7280)" }}>Mesa</span>
                <span style={{ fontWeight: 600, textAlign: "right" }}>{table_label}</span>
              </>
            )}
            {payment.kind === "seat" && payment.seat != null && (
              <>
                <span style={{ color: "var(--color-text-secondary, #6b7280)" }}>Silla</span>
                <span style={{ fontWeight: 600, textAlign: "right" }}>{payment.seat}</span>
              </>
            )}
            <span style={{ color: "var(--color-text-secondary, #6b7280)" }}>Fecha</span>
            <span style={{ fontWeight: 600, textAlign: "right" }}>{formatDate(payment.created_at)}</span>
            <span style={{ color: "var(--color-text-secondary, #6b7280)" }}>Recibo #</span>
            <span
              style={{
                fontWeight: 600,
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
          <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4, color: "var(--color-text-secondary, #6b7280)" }}>
            Productos
          </h2>
          {items.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--color-text-secondary, #6b7280)", padding: "8px 0" }}>
              —
            </p>
          ) : (
            items.map((item, i) => <ItemRow key={i} item={item} />)
          )}
        </div>

        {/* Totals */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid var(--color-border, #e5e7eb)",
            marginTop: 8,
          }}
        >
          <TotalRow label="Subtotal" value={formatCents(payment.subtotal_cents)} />
          <TotalRow label="Impuesto" value={formatCents(payment.tax_cents)} />
          {payment.tip_cents > 0 && (
            <TotalRow label="Propina" value={formatCents(payment.tip_cents)} />
          )}
          <div style={{ borderTop: "1px solid var(--color-border, #e5e7eb)", marginTop: 8, paddingTop: 8 }}>
            <TotalRow label="Total" value={formatCents(total)} bold large />
          </div>
        </div>

        {/* Payment method */}
        {(payment.card_brand && payment.card_last4) && (
          <div
            style={{
              padding: "0 24px 16px",
              fontSize: 13,
              color: "var(--color-text-secondary, #6b7280)",
            }}
          >
            Pago:{" "}
            <strong>
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

      {/* Footer branding */}
      <p
        style={{
          marginTop: 24,
          fontSize: 12,
          color: "var(--color-text-tertiary, #9ca3af)",
        }}
      >
        Powered by JChat
      </p>
    </div>
  );
}
