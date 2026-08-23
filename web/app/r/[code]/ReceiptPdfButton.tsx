"use client";

/**
 * ReceiptPdfButton — client component.
 * Uses jsPDF v4 (pure, no autotable) to generate a receipt PDF.
 */

import { useState } from "react";
import { IconDownload } from "@tabler/icons-react";
import type { PublicReceipt } from "./page";

interface Props {
  receipt: PublicReceipt;
  code: string;
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

export default function ReceiptPdfButton({ receipt, code, label, generatingLabel }: Props) {
  const [generating, setGenerating] = useState(false);

  const handleDownload = async () => {
    setGenerating(true);
    try {
      const jsPDF = (await import("jspdf")).default;
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      const pageW = 210;
      const margin = 20;
      const contentW = pageW - margin * 2;
      let y = 20;

      // Header — business name
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text(receipt.business.name, margin, y);
      y += 8;

      // Business address / phone
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      if (receipt.business.address) {
        const addr = [receipt.business.address, receipt.business.city, receipt.business.state]
          .filter(Boolean)
          .join(", ");
        doc.text(addr, margin, y);
        y += 5;
      }
      if (receipt.business.phone) {
        doc.text(receipt.business.phone, margin, y);
        y += 5;
      }

      y += 3;
      doc.setDrawColor(180, 180, 180);
      doc.line(margin, y, margin + contentW, y);
      y += 6;

      // Receipt meta
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("PAID", margin, y);
      y += 5;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(`Receipt #: ${code}`, margin, y);
      y += 5;
      doc.text(`Date: ${formatDate(receipt.payment.created_at)}`, margin, y);
      y += 5;
      if (receipt.table_label) {
        doc.text(`Table: ${receipt.table_label}`, margin, y);
        y += 5;
      }
      if (receipt.payment.kind === "seat" && receipt.payment.seat != null) {
        doc.text(`Seat: ${receipt.payment.seat}`, margin, y);
        y += 5;
      }

      y += 3;
      doc.line(margin, y, margin + contentW, y);
      y += 6;

      // Items header
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("Item", margin, y);
      doc.text("Qty", margin + contentW - 40, y, { align: "right" });
      doc.text("Price", margin + contentW, y, { align: "right" });
      y += 4;
      doc.line(margin, y, margin + contentW, y);
      y += 5;

      doc.setFont("helvetica", "normal");
      for (const item of receipt.items) {
        // Name (wrap if needed)
        const lines = doc.splitTextToSize(item.name, contentW - 50);
        doc.text(lines, margin, y);
        doc.text(String(item.qty), margin + contentW - 40, y, { align: "right" });
        doc.text(formatCents(item.price_cents * item.qty), margin + contentW, y, { align: "right" });
        y += lines.length * 4 + 1;

        // Modifiers
        if (item.options?.modifiers) {
          doc.setFontSize(8);
          doc.setTextColor(100, 100, 100);
          for (const mod of item.options.modifiers) {
            const modLine = `  ${mod.group_label}: ${mod.choice_labels.join(", ")}`;
            const modLines = doc.splitTextToSize(modLine, contentW - 10);
            doc.text(modLines, margin, y);
            y += modLines.length * 4;
          }
          doc.setFontSize(9);
          doc.setTextColor(0, 0, 0);
        }

        // Special instructions
        if (item.special_instructions) {
          doc.setFontSize(8);
          doc.setTextColor(100, 100, 100);
          const siLines = doc.splitTextToSize(`  Note: ${item.special_instructions}`, contentW - 10);
          doc.text(siLines, margin, y);
          y += siLines.length * 4;
          doc.setFontSize(9);
          doc.setTextColor(0, 0, 0);
        }
      }

      y += 3;
      doc.line(margin, y, margin + contentW, y);
      y += 6;

      // Totals
      const totalsX = margin + contentW - 60;
      const valX = margin + contentW;

      const addTotalRow = (label: string, cents: number, bold = false) => {
        if (bold) doc.setFont("helvetica", "bold");
        else doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text(label, totalsX, y);
        doc.text(formatCents(cents), valX, y, { align: "right" });
        y += 5;
      };

      addTotalRow("Subtotal", receipt.payment.subtotal_cents);
      addTotalRow("Tax", receipt.payment.tax_cents);
      if (receipt.payment.tip_cents > 0) {
        addTotalRow("Tip", receipt.payment.tip_cents);
      }
      addTotalRow(
        "Total",
        receipt.payment.amount_cents + receipt.payment.tip_cents,
        true,
      );

      y += 3;
      doc.line(margin, y, margin + contentW, y);
      y += 6;

      // Payment method
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      if (receipt.payment.card_brand && receipt.payment.card_last4) {
        const brand = receipt.payment.card_brand.charAt(0).toUpperCase() +
          receipt.payment.card_brand.slice(1);
        doc.text(`Payment: ${brand} ••••${receipt.payment.card_last4}`, margin, y);
        y += 5;
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
        background: "var(--color-brand)",
        color: "#fff",
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
