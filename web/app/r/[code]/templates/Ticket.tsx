/**
 * Ticket receipt template — thermal paper aesthetic.
 *
 * Style: monospaced font, dashed separators, centered layout,
 * decorative CSS barcode at bottom. Cream/white background,
 * no logo border. Brand color only in the header strip and TOTAL value.
 */

import ReceiptPdfButton from "../ReceiptPdfButton";
import { C, formatCents, formatDate, PaidBadge } from "./shared";
import type { ReceiptTemplateProps } from "./types";
import type { ReceiptItem } from "../page";

// Ticket-specific palette (extends base C)
const T = {
  bg:       "#fdfaf5",  // warm cream
  border:   "#d1c9b8",  // warm gray dashes
  text:     "#1a1a1a",
  textSec:  "#7a7060",
} as const;

const MONO: React.CSSProperties = {
  fontFamily: '"Courier New", Courier, "Lucida Console", monospace',
};

function Dashes({ color = T.border }: { color?: string }) {
  return (
    <div
      style={{
        borderTop: `1px dashed ${color}`,
        margin: "10px 0",
      }}
    />
  );
}

function TicketItemRow({ item }: { item: ReceiptItem }) {
  const lineTotal = formatCents(item.price_cents * item.qty);
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ flex: 1, paddingRight: 8 }}>
          {item.qty > 1 ? `${item.qty}x ` : ""}{item.name}
        </span>
        <span style={{ whiteSpace: "nowrap" }}>{lineTotal}</span>
      </div>
      {item.options?.modifiers?.map((mod, i) => (
        <div key={i} style={{ paddingLeft: 16, color: T.textSec, fontSize: 11 }}>
          + {mod.group_label}: {mod.choice_labels.join(", ")}
        </div>
      ))}
      {item.special_instructions && (
        <div style={{ paddingLeft: 16, color: T.textSec, fontSize: 11, fontStyle: "italic" }}>
          * {item.special_instructions}
        </div>
      )}
    </div>
  );
}

// Decorative CSS barcode — alternating narrow/wide bars, purely visual
function Barcode({ color }: { color: string }) {
  const bars = [2, 1, 3, 1, 2, 1, 1, 3, 2, 1, 1, 2, 3, 1, 1, 2, 1, 3, 1, 2, 1, 1, 2, 3, 1, 2, 1, 1];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        height: 40,
        gap: 1,
        justifyContent: "center",
        margin: "12px 0 4px",
      }}
    >
      {bars.map((w, i) =>
        i % 2 === 0 ? (
          <div
            key={i}
            style={{ width: w * 2, background: color, flexShrink: 0 }}
          />
        ) : (
          <div key={i} style={{ width: w * 2, flexShrink: 0 }} />
        )
      )}
    </div>
  );
}

export default function TicketReceipt({
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
        background: C.pageBg,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "32px 16px 48px",
      }}
    >
      <div
        style={{
          ...MONO,
          background: T.bg,
          color: T.text,
          maxWidth: 360,
          width: "100%",
          boxShadow: "0 2px 20px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)",
          overflow: "hidden",
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        {/* Header strip — brand color */}
        <div
          style={{
            background: brandColor,
            color: brandText,
            textAlign: "center",
            padding: "20px 20px 16px",
          }}
        >
          {business.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={business.logo_url}
              alt={business.name}
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                objectFit: "cover",
                margin: "0 auto 8px",
                display: "block",
              }}
            />
          )}
          <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: "0.05em", color: brandText }}>
            {business.name.toUpperCase()}
          </div>
          {business.address && (
            <div style={{ fontSize: 11, opacity: 0.85, marginTop: 4, color: brandText }}>
              {[business.address, business.city, business.state].filter(Boolean).join(", ")}
            </div>
          )}
          {business.phone && (
            <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2, color: brandText }}>
              Tel: {business.phone}
            </div>
          )}
        </div>

        {/* Ticket body */}
        <div style={{ padding: "16px 20px" }}>

          {/* PAGADO */}
          <div style={{ textAlign: "center", marginBottom: 12 }}>
            <PaidBadge />
          </div>

          <Dashes />

          {/* Meta */}
          {table_label && (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: T.textSec }}>MESA</span>
              <span style={{ fontWeight: 700 }}>{table_label}</span>
            </div>
          )}
          {payment.kind === "seat" && payment.seat != null && (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: T.textSec }}>SILLA</span>
              <span style={{ fontWeight: 700 }}>{payment.seat}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: T.textSec }}>FECHA</span>
            <span style={{ fontWeight: 700, fontSize: 11 }}>{formatDate(payment.created_at)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: T.textSec }}>RECIBO</span>
            <span style={{ fontSize: 10, wordBreak: "break-all", maxWidth: "60%", textAlign: "right" }}>
              {code}
            </span>
          </div>

          <Dashes />

          {/* Items header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontWeight: 700,
              fontSize: 11,
              color: T.textSec,
              letterSpacing: "0.06em",
              marginBottom: 6,
            }}
          >
            <span>PRODUCTO</span>
            <span>TOTAL</span>
          </div>

          {/* Items */}
          {items.length === 0 ? (
            <div style={{ color: T.textSec, fontSize: 12 }}>—</div>
          ) : (
            items.map((item, i) => <TicketItemRow key={i} item={item} />)
          )}

          <Dashes />

          {/* Totals */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: T.textSec }}>SUBTOTAL</span>
              <span>{formatCents(payment.subtotal_cents)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: T.textSec }}>IMPUESTO</span>
              <span>{formatCents(payment.tax_cents)}</span>
            </div>
            {payment.tip_cents > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: T.textSec }}>PROPINA</span>
                <span>{formatCents(payment.tip_cents)}</span>
              </div>
            )}
            <Dashes />
            {/* TOTAL in brand accent color */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontWeight: 700,
                fontSize: 16,
              }}
            >
              <span>TOTAL</span>
              <span style={{ color: accentColor }}>{formatCents(total)}</span>
            </div>
          </div>

          {/* Payment method */}
          {payment.card_brand && payment.card_last4 && (
            <>
              <Dashes />
              <div style={{ color: T.textSec, fontSize: 11, textAlign: "center" }}>
                PAGO:{" "}
                <span style={{ color: T.text, fontWeight: 700 }}>
                  {payment.card_brand.toUpperCase()} ••••{payment.card_last4}
                </span>
              </div>
            </>
          )}

          {/* Decorative barcode (CSS) */}
          <Dashes />
          <Barcode color={T.border} />
          <div style={{ textAlign: "center", fontSize: 10, color: T.textSec, letterSpacing: "0.15em" }}>
            {code.slice(0, 16)}
          </div>

          <Dashes />

          {/* Menu link */}
          {business.slug && (
            <div style={{ textAlign: "center", margin: "8px 0" }}>
              <a
                href={`/m/${business.slug}`}
                style={{ fontSize: 12, color: accentColor, textDecoration: "underline" }}
              >
                Ver el menú →
              </a>
            </div>
          )}

          {/* PDF button */}
          <div style={{ textAlign: "center", marginTop: 8 }}>
            <ReceiptPdfButton
              receipt={receipt}
              code={code}
              brandColor={brandColor}
              brandTextColor={brandText}
              label="Descargar PDF"
              generatingLabel="Generando PDF…"
            />
          </div>

          <Dashes />
          <div style={{ textAlign: "center", fontSize: 10, color: T.textSec, letterSpacing: "0.1em" }}>
            GRACIAS POR SU VISITA
          </div>
          <div style={{ textAlign: "center", fontSize: 10, color: T.textSec, marginTop: 2 }}>
            Powered by JChat
          </div>
          <div style={{ height: 16 }} />
        </div>
      </div>
    </div>
  );
}
