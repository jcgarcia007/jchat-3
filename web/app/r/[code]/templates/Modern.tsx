/**
 * Modern receipt template — THE ORIGINAL Etapa 1 design, extracted verbatim.
 * DO NOT redesign this; it must remain pixel-identical to the old ReceiptView output.
 *
 * Card with brand-color header band, white body, PAGADO chip, meta grid,
 * item list, totals, card info, menu link, PDF button.
 */

import ReceiptPdfButton from "../ReceiptPdfButton";
import { C, formatCents, formatDate, PaidBadge, ItemRow, TotalRow } from "./shared";
import type { ReceiptTemplateProps } from "./types";

export default function ModernReceipt({
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
        {/* ① Brand header — background = brandColor, text = brandText (WCAG contrast) */}
        <div
          style={{
            background: brandColor,
            padding: "28px 24px 24px",
            color: brandText,
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
                border: `3px solid ${brandText === "#ffffff" ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.15)"}`,
              }}
            />
          )}
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: brandText }}>
            {business.name}
          </h1>
          {business.address && (
            <p
              style={{
                fontSize: 13,
                color: brandText,
                opacity: 0.85,
                marginTop: 4,
                marginBottom: 0,
              }}
            >
              {[business.address, business.city, business.state].filter(Boolean).join(", ")}
            </p>
          )}
        </div>

        {/* PAID badge — always green, never brand color */}
        <div style={{ textAlign: "center", padding: "16px 24px 0" }}>
          <PaidBadge />
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
                <span style={{ fontWeight: 600, color: C.text, textAlign: "right" }}>
                  {table_label}
                </span>
              </>
            )}
            {payment.kind === "seat" && payment.seat != null && (
              <>
                <span style={{ color: C.textSec }}>Silla</span>
                <span style={{ fontWeight: 600, color: C.text, textAlign: "right" }}>
                  {payment.seat}
                </span>
              </>
            )}
            <span style={{ color: C.textSec }}>Fecha</span>
            <span style={{ fontWeight: 600, color: C.text, textAlign: "right" }}>
              {formatDate(payment.created_at)}
            </span>
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
          {/* ② TOTAL — value in brand accent color (legible on white) */}
          <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 8, paddingTop: 8 }}>
            <TotalRow
              label="Total"
              value={formatCents(total)}
              bold
              large
              accentColor={accentColor}
            />
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

        {/* ③ "Ver el menú" link — accent color on white */}
        {business.slug && (
          <div style={{ padding: "0 24px 12px", textAlign: "center" }}>
            <a
              href={`/m/${business.slug}`}
              style={{
                fontSize: 13,
                color: accentColor,
                fontWeight: 600,
                textDecoration: "underline",
                textUnderlineOffset: 2,
              }}
            >
              Ver el menú →
            </a>
          </div>
        )}

        {/* ④ PDF button — background = brandColor, text = brandText */}
        <div style={{ padding: "8px 24px 28px", textAlign: "center" }}>
          <ReceiptPdfButton
            receipt={receipt}
            code={code}
            brandColor={brandColor}
            brandTextColor={brandText}
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
