/**
 * Elegant receipt template — fine dining, serif typography.
 *
 * Style: Georgia/Times serif, business name in italic, labels in small-caps,
 * thin hairline rules, brand color as a delicate accent (not a full band).
 * Suitable for upscale restaurants, boutique venues.
 */

import ReceiptPdfButton from "../ReceiptPdfButton";
import { C, formatCents, formatDate, PaidBadge } from "./shared";
import type { ReceiptTemplateProps } from "./types";
import type { ReceiptItem } from "../page";

const SERIF: React.CSSProperties = {
  fontFamily: "Georgia, 'Times New Roman', Times, serif",
};

const SMALL_CAPS: React.CSSProperties = {
  fontVariant: "small-caps",
  letterSpacing: "0.06em",
};

function HairRule({ color = C.border, double = false }: { color?: string; double?: boolean }) {
  if (double) {
    return (
      <div style={{ margin: "12px 0" }}>
        <div style={{ borderTop: `1px solid ${color}` }} />
        <div style={{ borderTop: `1px solid ${color}`, marginTop: 3 }} />
      </div>
    );
  }
  return <div style={{ borderTop: `1px solid ${color}`, margin: "12px 0" }} />;
}

function ElegantItem({ item, accentColor }: { item: ReceiptItem; accentColor: string }) {
  return (
    <div style={{ padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 14, color: C.text, ...SERIF }}>
            {item.qty > 1 && (
              <span style={{ fontSize: 12, color: accentColor, marginRight: 6 }}>
                {item.qty}
              </span>
            )}
            {item.name}
          </span>
          {item.options?.modifiers?.map((mod, i) => (
            <div
              key={i}
              style={{
                fontSize: 11,
                color: C.textSec,
                marginTop: 3,
                paddingLeft: 14,
                ...SERIF,
                fontStyle: "italic",
              }}
            >
              {mod.group_label}: {mod.choice_labels.join(", ")}
            </div>
          ))}
          {item.special_instructions && (
            <div
              style={{
                fontSize: 11,
                color: C.textTer,
                marginTop: 3,
                paddingLeft: 14,
                ...SERIF,
                fontStyle: "italic",
              }}
            >
              {item.special_instructions}
            </div>
          )}
        </div>
        <span style={{ fontSize: 14, color: C.text, whiteSpace: "nowrap", ...SERIF }}>
          {formatCents(item.price_cents * item.qty)}
        </span>
      </div>
    </div>
  );
}

export default function ElegantReceipt({
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
        background: "#f0ece4",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "40px 20px 60px",
      }}
    >
      <div
        style={{
          ...SERIF,
          background: "#faf8f5",
          color: C.text,
          maxWidth: 480,
          width: "100%",
          boxShadow: "0 4px 32px rgba(0,0,0,0.08)",
          border: `1px solid ${C.border}`,
        }}
      >
        {/* Decorative top accent bar */}
        <div style={{ height: 3, background: accentColor }} />

        {/* Header */}
        <div style={{ padding: "36px 36px 24px", textAlign: "center" }}>
          {business.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={business.logo_url}
              alt={business.name}
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                objectFit: "cover",
                margin: "0 auto 16px",
                display: "block",
                border: `1px solid ${C.border}`,
              }}
            />
          )}
          {/* Business name — italic serif */}
          <h1
            style={{
              ...SERIF,
              fontStyle: "italic",
              fontWeight: 400,
              fontSize: 24,
              margin: 0,
              color: C.text,
              letterSpacing: "0.02em",
            }}
          >
            {business.name}
          </h1>
          {business.address && (
            <p
              style={{
                ...SERIF,
                fontSize: 12,
                color: C.textSec,
                marginTop: 8,
                marginBottom: 0,
                letterSpacing: "0.04em",
              }}
            >
              {[business.address, business.city, business.state].filter(Boolean).join("  ·  ")}
            </p>
          )}
          {business.phone && (
            <p style={{ ...SERIF, fontSize: 12, color: C.textSec, marginTop: 4, marginBottom: 0 }}>
              {business.phone}
            </p>
          )}
        </div>

        <HairRule double color={accentColor} />

        {/* PAGADO + meta */}
        <div style={{ padding: "0 36px" }}>
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <PaidBadge />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gap: "6px 20px",
              fontSize: 13,
            }}
          >
            {table_label && (
              <>
                <span style={{ ...SMALL_CAPS, color: C.textSec, fontSize: 12 }}>Mesa</span>
                <span style={{ textAlign: "right", color: C.text }}>{table_label}</span>
              </>
            )}
            {payment.kind === "seat" && payment.seat != null && (
              <>
                <span style={{ ...SMALL_CAPS, color: C.textSec, fontSize: 12 }}>Silla</span>
                <span style={{ textAlign: "right", color: C.text }}>{payment.seat}</span>
              </>
            )}
            <span style={{ ...SMALL_CAPS, color: C.textSec, fontSize: 12 }}>Fecha</span>
            <span style={{ textAlign: "right", color: C.text, fontSize: 12 }}>
              {formatDate(payment.created_at)}
            </span>
            <span style={{ ...SMALL_CAPS, color: C.textSec, fontSize: 12 }}>Recibo</span>
            <span
              style={{
                textAlign: "right",
                color: C.textSec,
                fontSize: 10,
                fontFamily: "monospace",
                wordBreak: "break-all",
              }}
            >
              {code}
            </span>
            {receipt.server_name && (
              <>
                <span style={{ ...SMALL_CAPS, color: C.textSec, fontSize: 12 }}>Atendido</span>
                <span style={{ textAlign: "right", color: C.text, fontSize: 13 }}>
                  {receipt.server_name}
                </span>
              </>
            )}
          </div>
        </div>

        <HairRule />

        {/* Items */}
        <div style={{ padding: "0 36px" }}>
          <div
            style={{
              ...SMALL_CAPS,
              fontSize: 11,
              color: C.textSec,
              marginBottom: 4,
              letterSpacing: "0.1em",
            }}
          >
            Pedido
          </div>
          {items.length === 0 ? (
            <p style={{ ...SERIF, fontSize: 14, color: C.textSec, fontStyle: "italic" }}>—</p>
          ) : (
            items.map((item, i) => (
              <ElegantItem key={i} item={item} accentColor={accentColor} />
            ))
          )}
        </div>

        <HairRule />

        {/* Totals */}
        <div style={{ padding: "0 36px 24px" }}>
          {[
            { label: "Subtotal", value: formatCents(payment.subtotal_cents) },
            { label: "Impuesto", value: formatCents(payment.tax_cents) },
            ...(payment.tip_cents > 0
              ? [{ label: "Gratificación", value: formatCents(payment.tip_cents) }]
              : []),
          ].map(({ label, value }) => (
            <div
              key={label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "3px 0",
                fontSize: 13,
                color: C.textSec,
                ...SERIF,
              }}
            >
              <span style={SMALL_CAPS}>{label}</span>
              <span>{value}</span>
            </div>
          ))}

          <HairRule />

          {/* TOTAL — accentColor on white, large */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
            }}
          >
            <span
              style={{
                ...SERIF,
                ...SMALL_CAPS,
                fontSize: 15,
                color: C.text,
                fontWeight: 400,
              }}
            >
              Total
            </span>
            {/* accentOnWhite ensures readability on #faf8f5 background */}
            <span
              style={{
                ...SERIF,
                fontSize: 24,
                fontWeight: 400,
                fontStyle: "italic",
                color: accentColor,
              }}
            >
              {formatCents(total)}
            </span>
          </div>
        </div>

        {/* Payment method */}
        {payment.card_brand && payment.card_last4 && (
          <div
            style={{
              padding: "0 36px 20px",
              fontSize: 12,
              color: C.textSec,
              ...SERIF,
              fontStyle: "italic",
              textAlign: "center",
            }}
          >
            Cobrado a{" "}
            {payment.card_brand.charAt(0).toUpperCase() + payment.card_brand.slice(1)}{" "}
            terminada en {payment.card_last4}
          </div>
        )}

        <HairRule double color={accentColor} />

        {/* Footer */}
        <div style={{ padding: "16px 36px 36px", textAlign: "center" }}>
          {business.slug && (
            <a
              href={`/m/${business.slug}`}
              style={{
                ...SERIF,
                fontSize: 12,
                fontStyle: "italic",
                color: accentColor,
                textDecoration: "none",
                letterSpacing: "0.04em",
                display: "block",
                marginBottom: 16,
              }}
            >
              Ver el menú →
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
          <p
            style={{
              ...SERIF,
              fontStyle: "italic",
              fontSize: 11,
              color: C.textTer,
              marginTop: 16,
              marginBottom: 0,
              letterSpacing: "0.06em",
            }}
          >
            Powered by JChat
          </p>
        </div>
      </div>
    </div>
  );
}
