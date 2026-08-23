/**
 * PurchaseOrderModal — Fase 4
 * Generates one PDF per supplier from the current inventory selection.
 * - Settings (legal header) are loaded/saved to purchase_order_settings table.
 * - "Guardar encabezado" is decoupled from "Generar PDF" — generating is always
 *   allowed using whatever is currently in the form.
 * - Items without a supplier show as a warning; no PDF is generated for them.
 * - Default qty = max(par_level − stock_count, 0); fallback 1 if no par_level.
 * - PDF is built client-side with jsPDF v4 (no autotable).
 * - Costs come from costMap prop (owner-only data; never fetched inside this modal).
 *
 * Design: var(--db-*) tokens only. Icons: @tabler/icons-react only.
 */

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  IconAlertTriangle,
  IconCheck,
  IconDeviceFloppy,
  IconDownload,
  IconX,
} from "@tabler/icons-react";
import jsPDF from "jspdf";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// ── Minimal types (structural subset of page.tsx types) ───────────────────────

interface MenuItem {
  id: string;
  name: string;
  stock_count: number;
  par_level: number | null;
  supplier_id: string | null;
}

interface Supplier {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
}

interface POForm {
  legal_name: string;
  address: string;
  phone: string;
  email: string;
  notes: string;
}

export interface PurchaseOrderModalProps {
  businessId: string;
  selectedItems: MenuItem[];
  suppliers: Supplier[];
  costMap: Record<string, number | null>;
  locale: string;
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Default reorder qty: max(par − stock, 0) when par exists, else 1. */
function defaultQty(item: MenuItem): number {
  if (item.par_level != null) {
    return Math.max(item.par_level - item.stock_count, 0);
  }
  return 1;
}

function fmtCents(cents: number | null | undefined, locale: string): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ── PDF locale labels (not the i18n system — these are embedded in the PDF) ───

function pdfLabels(locale: string) {
  const es = locale === "es";
  return {
    title:      es ? "ORDEN DE COMPRA"   : "PURCHASE ORDER",
    date:       es ? "Fecha:"            : "Date:",
    supplier:   es ? "Proveedor:"        : "Supplier:",
    colNum:     "#",
    colProduct: es ? "Producto"          : "Product",
    colStock:   es ? "Stock actual"      : "Current stock",
    colQty:     es ? "Cantidad"          : "Qty",
    colCost:    es ? "Costo"             : "Cost",
    colTotal:   es ? "Total"             : "Total",
    total:      es ? "TOTAL"             : "TOTAL",
    notes:      es ? "Notas:"            : "Notes:",
  };
}

// ── PDF generator ─────────────────────────────────────────────────────────────

function generatePurchaseOrderPdf(
  supplierName: string,
  items: MenuItem[],
  qtyMap: Record<string, number>,
  costMap: Record<string, number | null>,
  form: POForm,
  locale: string,
  today: string,
): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const lbl = pdfLabels(locale);

  // Geometry
  const L  = 15;  // left margin
  const R  = 195; // right edge  (210 − 15)

  // Column X-positions (left-aligned anchors; right-aligned text uses rightmost X)
  const C = {
    num:     { x: L,        rX: L + 7   },
    product: { x: L + 9,    rX: L + 81  },
    stock:   { x: L + 83,   rX: L + 105 },
    qty:     { x: L + 107,  rX: L + 127 },
    cost:    { x: L + 129,  rX: L + 155 },
    total:   { x: L + 157,  rX: R       },
  };

  let y = 18;

  // ── Title + date ────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(20, 20, 20);
  doc.text(lbl.title, L, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(`${lbl.date} ${today}`, R, y, { align: "right" });
  y += 7;

  // ── Separator ────────────────────────────────────────────────────────────
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.line(L, y, R, y);
  y += 5;

  // ── Business header ──────────────────────────────────────────────────────
  if (form.legal_name) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(30, 30, 30);
    doc.text(form.legal_name, L, y);
    y += 5;
  }
  if (form.address) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(110, 110, 110);
    doc.text(form.address, L, y);
    y += 4;
  }
  const contactLine = [form.phone, form.email].filter(Boolean).join("   |   ");
  if (contactLine) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(110, 110, 110);
    doc.text(contactLine, L, y);
    y += 4;
  }
  y += 3;

  // ── Separator ────────────────────────────────────────────────────────────
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.line(L, y, R, y);
  y += 5;

  // ── Supplier name ────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text(`${lbl.supplier} ${supplierName}`, L, y);
  y += 9;

  // ── Table header ─────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(130, 130, 130);

  doc.text(lbl.colNum,     C.num.x,     y);
  doc.text(lbl.colProduct, C.product.x, y);
  doc.text(lbl.colStock,   C.stock.rX,  y, { align: "right" });
  doc.text(lbl.colQty,     C.qty.rX,    y, { align: "right" });
  doc.text(lbl.colCost,    C.cost.rX,   y, { align: "right" });
  doc.text(lbl.colTotal,   C.total.rX,  y, { align: "right" });
  y += 3;

  doc.setDrawColor(160, 160, 160);
  doc.setLineWidth(0.25);
  doc.line(L, y, R, y);
  y += 4;

  // ── Rows ──────────────────────────────────────────────────────────────────
  let grandTotal = 0;
  let hasCost    = false;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  items.forEach((item, idx) => {
    if (y > 265) {
      doc.addPage();
      y = 20;
    }

    const qty      = qtyMap[item.id] ?? defaultQty(item);
    const cost     = costMap[item.id];
    const subtotal = cost != null ? cost * qty : null;
    if (subtotal != null) { grandTotal += subtotal; hasCost = true; }

    // Truncate long product name to fit column (~72 mm → ~55 chars in 9pt)
    const nameLines = doc.splitTextToSize(item.name, 72) as string[];
    const nameStr   = nameLines[0] ?? item.name;

    doc.setTextColor(30, 30, 30);
    doc.text(String(idx + 1), C.num.x,     y);
    doc.text(nameStr,         C.product.x, y);

    doc.setTextColor(90, 90, 90);
    doc.text(String(item.stock_count),    C.stock.rX, y, { align: "right" });
    doc.text(String(qty),                 C.qty.rX,   y, { align: "right" });
    doc.text(fmtCents(cost, locale),      C.cost.rX,  y, { align: "right" });

    doc.setTextColor(30, 30, 30);
    doc.setFont("helvetica", "bold");
    doc.text(fmtCents(subtotal, locale), C.total.rX, y, { align: "right" });
    doc.setFont("helvetica", "normal");

    y += 5.5;

    // Row separator (very light)
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.1);
    doc.line(L, y - 1.5, R, y - 1.5);
  });

  // ── Total ─────────────────────────────────────────────────────────────────
  y += 2;
  doc.setDrawColor(140, 140, 140);
  doc.setLineWidth(0.35);
  doc.line(L, y, R, y);
  y += 5;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(20, 20, 20);
  doc.text(lbl.total, C.cost.rX, y, { align: "right" });
  doc.text(fmtCents(hasCost ? grandTotal : null, locale), C.total.rX, y, { align: "right" });
  y += 10;

  // ── Notes ─────────────────────────────────────────────────────────────────
  if (form.notes) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(lbl.notes, L, y);
    y += 4;

    doc.setFont("helvetica", "normal");
    const noteLines = doc.splitTextToSize(form.notes, 180) as string[];
    doc.setTextColor(70, 70, 70);
    doc.text(noteLines, L, y);
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const safeName = supplierName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
  doc.save(`OC_${safeName}_${today}.pdf`);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PurchaseOrderModal({
  businessId,
  selectedItems,
  suppliers,
  costMap,
  locale,
  onClose,
}: PurchaseOrderModalProps) {
  const t = useTranslations("dashboardCommon");

  // ── Settings form ─────────────────────────────────────────────────────────
  const [form, setForm] = useState<POForm>({
    legal_name: "",
    address: "",
    phone: "",
    email: "",
    notes: "",
  });
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  // ── Per-item editable qty ─────────────────────────────────────────────────
  const [qtyMap, setQtyMap] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const item of selectedItems) {
      init[item.id] = defaultQty(item);
    }
    return init;
  });

  // ── Generating state (supplierId | null) ──────────────────────────────────
  const [generating, setGenerating] = useState<string | null>(null);

  // ── Derived maps ─────────────────────────────────────────────────────────
  const supplierById = useMemo<Record<string, Supplier>>(() => {
    const m: Record<string, Supplier> = {};
    for (const s of suppliers) m[s.id] = s;
    return m;
  }, [suppliers]);

  /** Items grouped by supplier_id (only items that HAVE a supplier) */
  const groupedBySupplierId = useMemo<Record<string, MenuItem[]>>(() => {
    const g: Record<string, MenuItem[]> = {};
    for (const item of selectedItems) {
      if (!item.supplier_id) continue;
      if (!g[item.supplier_id]) g[item.supplier_id] = [];
      g[item.supplier_id].push(item);
    }
    return g;
  }, [selectedItems]);

  /** Items without any supplier → warning only, no PDF */
  const noSupplierItems = useMemo(
    () => selectedItems.filter((i) => !i.supplier_id),
    [selectedItems],
  );

  const supplierIds = useMemo(() => Object.keys(groupedBySupplierId), [groupedBySupplierId]);

  // ── Load settings on mount ────────────────────────────────────────────────
  const loadSettings = useCallback(async () => {
    if (!isSupabaseConfigured || !businessId) {
      setLoadingSettings(false);
      return;
    }
    try {
      const { data } = await supabase
        .from("purchase_order_settings")
        .select("legal_name,address,phone,email,notes")
        .eq("business_id", businessId)
        .maybeSingle();
      if (data) {
        setForm({
          legal_name: data.legal_name ?? "",
          address:    data.address    ?? "",
          phone:      data.phone      ?? "",
          email:      data.email      ?? "",
          notes:      data.notes      ?? "",
        });
      }
    } catch {
      // ignore — form stays empty; user can still generate PDFs
    } finally {
      setLoadingSettings(false);
    }
  }, [businessId]);

  useEffect(() => { void loadSettings(); }, [loadSettings]);

  // ── Save header (separate from generate) ──────────────────────────────────
  async function handleSaveHeader() {
    if (!isSupabaseConfigured || !businessId) return;
    setSaving(true);
    setSavedOk(false);
    try {
      const { error } = await supabase
        .from("purchase_order_settings")
        .upsert({
          business_id: businessId,
          legal_name:  form.legal_name || null,
          address:     form.address    || null,
          phone:       form.phone      || null,
          email:       form.email      || null,
          notes:       form.notes      || null,
          updated_at:  new Date().toISOString(),
        });
      if (error) throw error;
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 3000);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  // ── Generate PDF for one supplier (uses current form state) ───────────────
  function handleGeneratePdf(supplierId: string) {
    const items    = groupedBySupplierId[supplierId];
    const supplier = supplierById[supplierId];
    if (!items?.length || !supplier) return;

    setGenerating(supplierId);
    try {
      const today = new Date().toISOString().slice(0, 10);
      generatePurchaseOrderPdf(
        supplier.name,
        items,
        qtyMap,
        costMap,
        form,
        locale,
        today,
      );
    } finally {
      setGenerating(null);
    }
  }

  // ── Per-supplier running total (cents) ────────────────────────────────────
  function supplierRunningTotal(supplierId: string): number | null {
    const its = groupedBySupplierId[supplierId] ?? [];
    let total = 0, hasCost = false;
    for (const i of its) {
      const c = costMap[i.id];
      if (c != null) { total += c * (qtyMap[i.id] ?? defaultQty(i)); hasCost = true; }
    }
    return hasCost ? total : null;
  }

  // ── Inline styles (all var(--db-*) tokens) ────────────────────────────────
  const inputSt: React.CSSProperties = {
    width: "100%",
    padding: "6px 10px",
    borderRadius: "var(--db-radius)",
    border: "1px solid var(--db-border)",
    background: "var(--db-bg-elevated)",
    color: "var(--db-text-primary)",
    fontSize: "13px",
    outline: "none",
    boxSizing: "border-box",
  };
  const labelSt: React.CSSProperties = {
    display: "block",
    fontSize: "10px",
    fontWeight: 700,
    color: "var(--db-text-secondary)",
    marginBottom: "4px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  };
  const thSt: React.CSSProperties = {
    padding: "6px 10px",
    fontSize: "10px",
    fontWeight: 700,
    color: "var(--db-text-tertiary)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    background: "var(--db-bg-elevated)",
    borderBottom: "1px solid var(--db-border)",
    whiteSpace: "nowrap",
  };
  const tdSt: React.CSSProperties = {
    padding: "7px 10px",
    fontSize: "12px",
    color: "var(--db-text-primary)",
    borderBottom: "1px solid var(--db-border)",
    verticalAlign: "middle",
  };
  function btn(bg: string, color: string, disabled = false): React.CSSProperties {
    return {
      display: "inline-flex",
      alignItems: "center",
      gap: "5px",
      padding: "6px 12px",
      borderRadius: "var(--db-radius)",
      border: "none",
      background: bg,
      color,
      fontSize: "12px",
      fontWeight: 600,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.55 : 1,
      whiteSpace: "nowrap",
    };
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.4)",
          zIndex: 9998,
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 9999,
          background: "var(--db-bg-surface)",
          border: "1px solid var(--db-border)",
          borderRadius: "var(--db-radius-card)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.28)",
          width: "min(720px, 96vw)",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* ── Modal header ─────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 22px 14px",
            borderBottom: "1px solid var(--db-border)",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: "15px", fontWeight: 700, color: "var(--db-text-primary)" }}>
            {t("poModalTitle")}
          </span>
          <button onClick={onClose} style={btn("transparent", "var(--db-text-secondary)")}>
            <IconX size={16} />
          </button>
        </div>

        {/* ── Scrollable body ───────────────────────────────────────────── */}
        <div style={{ overflowY: "auto", padding: "18px 22px", flex: 1 }}>

          {/* ── Order header settings ──────────────────────────────────── */}
          <div
            style={{
              background: "var(--db-bg-elevated)",
              border: "1px solid var(--db-border)",
              borderRadius: "var(--db-radius-card)",
              padding: "14px 16px",
              marginBottom: "22px",
            }}
          >
            <div
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: "var(--db-text-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: "12px",
              }}
            >
              {t("poModalHeaderSection")}
            </div>

            {loadingSettings ? (
              <div style={{ fontSize: "12px", color: "var(--db-text-secondary)" }}>…</div>
            ) : (
              <>
                {/* Two-column grid for text fields */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "10px 16px",
                    marginBottom: "10px",
                  }}
                >
                  <div>
                    <label style={labelSt}>{t("poModalLegalName")}</label>
                    <input
                      style={inputSt}
                      value={form.legal_name}
                      onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
                      placeholder="Restaurante El Sol S.A."
                    />
                  </div>
                  <div>
                    <label style={labelSt}>{t("poModalAddress")}</label>
                    <input
                      style={inputSt}
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      placeholder="Calle Principal 123"
                    />
                  </div>
                  <div>
                    <label style={labelSt}>{t("poModalPhone")}</label>
                    <input
                      style={inputSt}
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      placeholder="+1 555-0100"
                    />
                  </div>
                  <div>
                    <label style={labelSt}>{t("poModalEmail")}</label>
                    <input
                      style={inputSt}
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="compras@negocio.com"
                    />
                  </div>
                </div>

                {/* Notes — full width */}
                <div style={{ marginBottom: "12px" }}>
                  <label style={labelSt}>{t("poModalNotes")}</label>
                  <textarea
                    style={{
                      ...inputSt,
                      minHeight: "52px",
                      resize: "vertical",
                      fontFamily: "inherit",
                    }}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder={t("poModalNotesPlaceholder")}
                  />
                </div>

                {/* Save header action */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "10px" }}>
                  {savedOk && (
                    <span
                      style={{
                        fontSize: "12px",
                        color: "var(--color-success, #1D9E75)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <IconCheck size={13} />
                      {t("poModalSavedOk")}
                    </span>
                  )}
                  <button
                    onClick={() => void handleSaveHeader()}
                    disabled={saving}
                    style={btn("var(--db-bg-surface)", "var(--db-text-primary)", saving)}
                  >
                    <IconDeviceFloppy size={13} />
                    {saving ? "…" : t("poModalSaveHeader")}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* ── Per-supplier tables ───────────────────────────────────── */}
          {supplierIds.map((supplierId) => {
            const supplier   = supplierById[supplierId];
            const groupItems = groupedBySupplierId[supplierId];
            if (!supplier || !groupItems?.length) return null;

            const isGen  = generating === supplierId;
            const runTot = supplierRunningTotal(supplierId);

            return (
              <div key={supplierId} style={{ marginBottom: "22px" }}>
                {/* Supplier section header */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "8px",
                    flexWrap: "wrap",
                    gap: "6px",
                  }}
                >
                  <span
                    style={{ fontSize: "13px", fontWeight: 700, color: "var(--db-text-primary)" }}
                  >
                    {supplier.name}
                    {runTot != null && (
                      <span
                        style={{
                          fontWeight: 400,
                          color: "var(--db-text-secondary)",
                          marginLeft: "8px",
                          fontSize: "12px",
                        }}
                      >
                        — {t("poModalSubtotal")}: {fmtCents(runTot, locale)}
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => handleGeneratePdf(supplierId)}
                    disabled={isGen}
                    style={btn("var(--db-accent)", "var(--db-accent-text)", isGen)}
                  >
                    <IconDownload size={13} />
                    {isGen ? t("poModalGenerating") : t("poModalGeneratePdf")}
                  </button>
                </div>

                {/* Items table */}
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}
                  >
                    <thead>
                      <tr>
                        <th style={{ ...thSt, textAlign: "left", width: "32px" }}>#</th>
                        <th style={{ ...thSt, textAlign: "left" }}>{t("poModalProductCol")}</th>
                        <th style={{ ...thSt, textAlign: "right", width: "88px" }}>
                          {t("poModalStockCol")}
                        </th>
                        <th style={{ ...thSt, textAlign: "right", width: "100px" }}>
                          {t("poModalQtyCol")}
                        </th>
                        <th style={{ ...thSt, textAlign: "right", width: "88px" }}>
                          {t("poModalCostCol")}
                        </th>
                        <th style={{ ...thSt, textAlign: "right", width: "88px" }}>
                          {t("poModalTotalCol")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupItems.map((item, idx) => {
                        const qty      = qtyMap[item.id] ?? defaultQty(item);
                        const cost     = costMap[item.id];
                        const subtotal = cost != null ? cost * qty : null;
                        return (
                          <tr key={item.id}>
                            <td style={{ ...tdSt, color: "var(--db-text-tertiary)" }}>
                              {idx + 1}
                            </td>
                            <td style={tdSt}>{item.name}</td>
                            <td
                              style={{
                                ...tdSt,
                                textAlign: "right",
                                color: "var(--db-text-secondary)",
                              }}
                            >
                              {item.stock_count}
                            </td>
                            <td style={{ ...tdSt, textAlign: "right" }}>
                              <input
                                type="number"
                                min={0}
                                value={qty}
                                onChange={(e) => {
                                  const v = Math.max(
                                    0,
                                    parseInt(e.target.value, 10) || 0,
                                  );
                                  setQtyMap((prev) => ({ ...prev, [item.id]: v }));
                                }}
                                style={{
                                  width: "60px",
                                  padding: "3px 6px",
                                  borderRadius: "var(--db-radius)",
                                  border: "1px solid var(--db-border)",
                                  background: "var(--db-bg-elevated)",
                                  color: "var(--db-text-primary)",
                                  fontSize: "12px",
                                  textAlign: "right",
                                  outline: "none",
                                }}
                              />
                            </td>
                            <td
                              style={{
                                ...tdSt,
                                textAlign: "right",
                                color: "var(--db-text-secondary)",
                              }}
                            >
                              {fmtCents(cost, locale)}
                            </td>
                            <td
                              style={{
                                ...tdSt,
                                textAlign: "right",
                                fontWeight: 600,
                              }}
                            >
                              {fmtCents(subtotal, locale)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          {/* ── Sin proveedor — warning only, no PDF ──────────────────── */}
          {noSupplierItems.length > 0 && (
            <div
              style={{
                borderTop: supplierIds.length > 0 ? "1px solid var(--db-border)" : "none",
                paddingTop: supplierIds.length > 0 ? "14px" : 0,
                marginTop: supplierIds.length > 0 ? "4px" : 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  alignItems: "flex-start",
                  padding: "10px 12px",
                  background:
                    "color-mix(in srgb, var(--color-warning, #f59e0b) 10%, transparent)",
                  border:
                    "1px solid color-mix(in srgb, var(--color-warning, #f59e0b) 28%, transparent)",
                  borderRadius: "var(--db-radius)",
                  marginBottom: "8px",
                }}
              >
                <span
                  style={{
                    color: "var(--color-warning, #f59e0b)",
                    display: "flex",
                    flexShrink: 0,
                    marginTop: "1px",
                  }}
                >
                  <IconAlertTriangle size={14} />
                </span>
                <span style={{ fontSize: "12px", color: "var(--db-text-secondary)" }}>
                  {t("poModalNoSupplierWarning")}
                </span>
              </div>
              <ul style={{ margin: "0 0 0 20px", padding: 0 }}>
                {noSupplierItems.map((item) => (
                  <li
                    key={item.id}
                    style={{
                      fontSize: "12px",
                      color: "var(--db-text-secondary)",
                      marginBottom: "3px",
                    }}
                  >
                    {item.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
