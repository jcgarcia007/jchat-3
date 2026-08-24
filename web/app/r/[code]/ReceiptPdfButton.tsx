"use client";

/**
 * ReceiptPdfButton — client component.
 * Uses jsPDF v4 (pure, no autotable) to generate a receipt PDF.
 * brandColor and brandTextColor are passed from the server component
 * so the PDF header and total match the receipt's brand color.
 */

import { useState } from "react";
import { IconDownload } from "@tabler/icons-react";
import type { PublicReceipt } from "./page";

interface Props {
  receipt: PublicReceipt;
  code: string;
  brandColor: string;
  brandTextColor: string;
  label: string;
  generatingLabel: string;
}

function formatCents(cents: number): string {
  return "$" + (cents / 100).toFixed(2);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
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

/** Convert #RRGGBB to [r, g, b] 0-255 tuple for jsPDF setTextColor/setFillColor. */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export default function ReceiptPdfButton({
  receipt,
  code,
  brandColor,
  brandTextColor,
  label,
  generatingLabel,
}: Props) {
  const [generating, setGenerating] = useState(false);

  const handleDownload = async () => {
    setGenerating(true);
    try {
      const jsPDF = (await import("jspdf")).default;
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      const pageW = 210;
      const margin = 20;
      const contentW = pageW - margin * 2;
      let y = 0;

      const brandRgb = hexToRgb(brandColor);
      const brandTextRgb = hexToRgb(brandTextColor);

      // ── Brand header band ────────────────────────────────────────────────
      doc.setFillColor(...brandRgb);
      doc.rect(0, 0, pageW, 28, "F");
      doc.setTextColor(...brandTextRgb);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(receipt.business.name, pageW / 2, 13, { align: "center" });
      if (receipt.business.address) {
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        const addr = [receipt.business.address, receipt.business.city, receipt.business.state]
          .filter(Boolean)
          .join(", ");
        doc.text(addr, pageW / 2, 21, { align: "center" });
      }
      y = 36;

      // Reset text color for body
      doc.setTextColor(17, 24, 39); // #111827

      // ── Receipt meta ─────────────────────────────────────────────────────
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text("PAGADO", margin, y);
      y += 5;
      doc.text(`Recibo #: ${code}`, margin, y); y += 5;
      doc.text(`Fecha: ${formatDate(receipt.payment.created_at)}`, margin, y); y += 5;
      if (receipt.table_label) {
        doc.text(`Mesa: ${receipt.table_label}`, margin, y); y += 5;
      }
      if (receipt.payment.kind === "seat" && receipt.payment.seat != null) {
        doc.text(`Silla: ${receipt.payment.seat}`, margin, y); y += 5;
      }

      y += 3;
      doc.setDrawColor(229, 231, 235);
      doc.line(margin, y, margin + contentW, y);
      y += 6;

      // ── Items header ─────────────────────────────────────────────────────
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("Producto", margin, y);
      doc.text("Cant.", margin + contentW - 40, y, { align: "right" });
      doc.text("Precio", margin + contentW, y, { align: "right" });
      y += 4;
      doc.line(margin, y, margin + contentW, y);
      y += 5;

      doc.setFont("helvetica", "normal");
      for (const item of receipt.items) {
        const lines = doc.splitTextToSize(item.name, contentW - 50);
        doc.text(lines, margin, y);
        doc.text(String(item.qty), margin + contentW - 40, y, { align: "right" });
        doc.text(formatCents(item.price_cents * item.qty), margin + contentW, y, { align: "right" });
        y += lines.length * 4 + 1;

        if (item.options?.modifiers) {
          doc.setFontSize(8);
          doc.setTextColor(107, 114, 128);
          for (const mod of item.options.modifiers) {
            const modLine = `  ${mod.group_label}: ${mod.choice_labels.join(", ")}`;
            const ml = doc.splitTextToSize(modLine, contentW - 10);
            doc.text(ml, margin, y);
            y += ml.length * 4;
          }
          doc.setFontSize(9);
          doc.setTextColor(17, 24, 39);
        }
        if (item.special_instructions) {
          doc.setFontSize(8);
          doc.setTextColor(107, 114, 128);
          const sl = doc.splitTextToSize(`  Nota: ${item.special_instructions}`, contentW - 10);
          doc.text(sl, margin, y);
          y += sl.length * 4;
          doc.setFontSize(9);
          doc.setTextColor(17, 24, 39);
        }
      }

      y += 3;
      doc.line(margin, y, margin + contentW, y);
      y += 6;

      // ── Totals ───────────────────────────────────────────────────────────
      const totalsX = margin + contentW - 60;
      const valX = margin + contentW;

      const addRow = (lbl: string, cents: number, isBold = false, isAccent = false) => {
        doc.setFont("helvetica", isBold ? "bold" : "normal");
        doc.setFontSize(isBold ? 11 : 9);
        if (isAccent) {
          doc.setTextColor(...brandRgb);
        } else {
          doc.setTextColor(17, 24, 39);
        }
        doc.text(lbl, totalsX, y);
        doc.text(formatCents(cents), valX, y, { align: "right" });
        doc.setTextColor(17, 24, 39);
        y += isBold ? 7 : 5;
      };

      addRow("Subtotal", receipt.payment.subtotal_cents);
      addRow("Impuesto", receipt.payment.tax_cents);
      if (receipt.payment.tip_cents > 0) {
        addRow("Propina", receipt.payment.tip_cents);
      }
      doc.line(margin, y, margin + contentW, y);
      y += 4;
      addRow("Total", receipt.payment.amount_cents + receipt.payment.tip_cents, true, true);

      y += 3;
      doc.line(margin, y, margin + contentW, y);
      y += 6;

      // ── Payment method ────────────────────────────────────────────────────
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(107, 114, 128);
      if (receipt.payment.card_brand && receipt.payment.card_last4) {
        const brand =
          receipt.payment.card_brand.charAt(0).toUpperCase() +
          receipt.payment.card_brand.slice(1);
        doc.text(`Pago: ${brand} ••••${receipt.payment.card_last4}`, margin, y);
      }

      const today = new Date().toISOString().slice(0, 10);
      doc.save(`recibo-${today}.pdf`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={generating}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 20px",
        borderRadius: 8,
        border: "none",
        background: brandColor,
        color: brandTextColor,
        fontSize: 14,
        fontWeight: 600,
        cursor: generating ? "not-allowed" : "pointer",
        opacity: generating ? 0.7 : 1,
        transition: "opacity 0.15s",
      }}
    >
      <IconDownload size={16} />
      {generating ? generatingLabel : label}
    </button>
  );
}
