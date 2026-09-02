/**
 * Minimal receipt template — whitespace, thin typography, single accent line.
 *
 * Style: font-weight 300, generous padding, no brand header band —
 * just a thin top border in accentColor. All accents (total, links)
 * use accentColor (already legible on white — computed by dispatcher).
 */

import ReceiptPdfButton from "../ReceiptPdfButton";
import { C, formatCents, formatDate, PaidBadge } from "./shared";
import type { ReceiptTemplateProps } from "./types";
import type { ReceiptItem } from "../page";

function MinimalItem({ item, accentColor }: { item: ReceiptItem; accentColor: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 16,
        padding: "12px 0",
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 400, fontSize: 15, color: C.text, letterSpacing: "0.01em" }}>
          {item.qty > 1 && (
            <span style={{ color: accentColor, fontWeight: 300, marginRight: 6 }}>
              {item.qty}×
            </span>
          )}
          {item.name}
        </div>
        {item.options?.modifiers?.map((mod, i) => (
          <div key={i} style={{ fontSize: 12, color: C.textSec, marginTop: 3, fontWeight: 300 }}>
            {mod.group_label}: {mod.choice_labels.join(", ")}
          </div>
        ))}
        {item.special_instructions && (
          <div style={{ fontSize: 12, color: C.textTer, fontWeight: 300, marginTop: 3, fontStyle: "italic" }}>
            {item.special_instructions}
          </div>
        )}
      </div>
      <span style={{ fontWeight: 300, fontSize: 15, color: C.text, whiteSpace: "nowrap" }}>
        {formatCents(item.price_cents * item.qty)}
      </span>
    </div>
  );
}

export default function MinimalReceipt({
  receipt,
  brandColor,
  brandText,
  accentColor,
  code,
}: ReceiptTemplateProps) {
  const { business, payment, table_label, items } = receipt;
  const total = payment.amount_cents + payment.tip_cents;

  return (
    <div
      style={{
        colorScheme: "light",
        minHeight: "100dvh",
        background: "#f8f9fa",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "48px 20px 64px",
      }}
    >
      <div
        style={{
          background: C.cardBg,
          color: C.text,
          maxWidth: 520,
          width: "100%",
          // Thin top accent line instead of a full brand band
          borderTop: `4px solid ${accentColor}`,
          boxShadow: "0 1px 12px rgba(0,0,0,0.06)",
        }}
      >
        {/* Header — name + address, NO color band */}
        <div
          style={{
            padding: "40px 40px 24px",
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            {business.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={business.logo_url}
                alt={business.name}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  objectFit: "cover",
                  flexShrink: 0,
                }}
              />
            )}
            <div>
              <h1
                style={{
                  fontSize: 22,
                  fontWeight: 300,
                  letterSpacing: "0.04em",
                  margin: 0,
                  color: C.text,
                }}
              >
                {business.name}
              </h1>
              {business.address && (
                <p
                  style={{
                    fontSize: 12,
                    color: C.textSec,
                    fontWeight: 300,
                    letterSpacing: "0.03em",
                    marginTop: 4,
                    marginBottom: 0,
                  }}
                >
                  {[business.address, business.city, business.state].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Meta — horizontal, light */}
        <div
          style={{
            padding: "20px 40px",
            display: "flex",
            flexWrap: "wrap",
            gap: "12px 32px",
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <div style={{ textAlign: "center" }}>
            <PaidBadge />
          </div>
          {table_label && (
            <div>
              <div style={{ fontSize: 10, letterSpacing: "0.1em", color: C.textSec, fontWeight: 300, textTransform: "uppercase" }}>
                Mesa
              </div>
              <div style={{ fontSize: 14, color: C.text, fontWeight: 400, marginTop: 2 }}>
                {table_label}
              </div>
            </div>
          )}
          {payment.kind === "seat" && payment.seat != null && (
            <div>
              <div style={{ fontSize: 10, letterSpacing: "0.1em", color: C.textSec, fontWeight: 300, textTransform: "uppercase" }}>
                Silla
              </div>
              <div style={{ fontSize: 14, color: C.text, fontWeight: 400, marginTop: 2 }}>
                {payment.seat}
              </div>
            </div>
          )}
          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.1em", color: C.textSec, fontWeight: 300, textTransform: "uppercase" }}>
              Fecha
            </div>
            <div style={{ fontSize: 14, color: C.text, fontWeight: 400, marginTop: 2 }}>
              {formatDate(payment.created_at)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.1em", color: C.textSec, fontWeight: 300, textTransform: "uppercase" }}>
              Recibo
            </div>
            <div style={{ fontSize: 11, color: C.textSec, fontWeight: 300, marginTop: 2, fontFamily: "monospace" }}>
              {code.slice(0, 12)}…
            </div>
          </div>
          {receipt.server_name && (
            <div>
              <div style={{ fontSize: 10, letterSpacing: "0.1em", color: C.textSec, fontWeight: 300, textTransform: "uppercase" }}>
                Atendido
              </div>
              <div style={{ fontSize: 14, color: C.text, fontWeight: 400, marginTop: 2 }}>
                {receipt.server_name}
              </div>
            </div>
          )}
        </div>

        {/* Items */}
        <div style={{ padding: "24px 40px 0" }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: C.textSec,
              fontWeight: 300,
              marginBottom: 4,
            }}
          >
            Productos
          </div>
          {items.length === 0 ? (
            <p style={{ fontSize: 14, color: C.textSec, fontWeight: 300, padding: "8px 0" }}>—</p>
          ) : (
            items.map((item, i) => (
              <MinimalItem key={i} item={item} accentColor={accentColor} />
            ))
          )}
        </div>

        {/* Totals */}
        <div style={{ padding: "20px 40px", borderTop: `1px solid ${C.border}`, marginTop: 16 }}>
          {[
            { label: "Subtotal", value: formatCents(payment.subtotal_cents) },
            { label: "Impuesto", value: formatCents(payment.tax_cents) },
            ...(payment.tip_cents > 0 ? [{ label: "Propina", value: formatCents(payment.tip_cents) }] : []),
          ].map(({ label, value }) => (
            <div
              key={label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "3px 0",
                fontSize: 13,
                fontWeight: 300,
                color: C.textSec,
              }}
            >
              <span>{label}</span>
              <span>{value}</span>
            </div>
          ))}

          {/* TOTAL — prominent accent, thin weight */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              paddingTop: 16,
              marginTop: 8,
              borderTop: `1px solid ${C.border}`,
            }}
          >
            <span
              style={{
                fontSize: 12,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: C.textSec,
                fontWeight: 300,
              }}
            >
              Total
            </span>
            {/* accentColor: legible on white (computed by dispatcher) */}
            <span style={{ fontSize: 26, fontWeight: 300, color: accentColor, letterSpacing: "-0.01em" }}>
              {formatCents(total)}
            </span>
          </div>
        </div>

        {/* Payment method */}
        {payment.card_brand && payment.card_last4 && (
          <div
            style={{
              padding: "0 40px 20px",
              fontSize: 12,
              color: C.textSec,
              fontWeight: 300,
              letterSpacing: "0.02em",
            }}
          >
            Pagado con{" "}
            <span style={{ color: C.text }}>
              {payment.card_brand.charAt(0).toUpperCase() + payment.card_brand.slice(1)}{" "}
              ••••{payment.card_last4}
            </span>
          </div>
        )}

        {/* Footer: menu link + PDF */}
        <div
          style={{
            padding: "20px 40px 40px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
            borderTop: `1px solid ${C.border}`,
          }}
        >
          {business.slug && (
            <a
              href={`/m/${business.slug}`}
              style={{
                fontSize: 12,
                letterSpacing: "0.06em",
                color: accentColor,
                textDecoration: "none",
                borderBottom: `1px solid ${accentColor}`,
                paddingBottom: 1,
              }}
            >
              Ver el menú
            </a>
          )}
          <ReceiptPdfButton
            receipt={receipt}
            code={code}
            brandColor={brandColor}
            brandTextColor={brandText}
            label="Descargar PDF"
            generatingLabel="Generando…"
          />
          <p style={{ fontSize: 11, color: C.textTer, fontWeight: 300, margin: 0, letterSpacing: "0.04em" }}>
            Powered by JChat
          </p>
        </div>
      </div>
    </div>
  );
}
