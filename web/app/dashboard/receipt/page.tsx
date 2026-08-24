"use client";

/**
 * JChat 3.0 — Dashboard › Recibo Digital
 *
 * (b) Configuración de color de marca del recibo — Etapa 2.
 *
 * Shows the owner a live receipt preview (hardcoded sample data) rendered with
 * the current brand color, plus the color picker to change it.
 * The same field (businesses.receipt_brand_color) is also editable from
 * /dashboard/configuration/businesses.
 *
 * Uses --db-* tokens for the dashboard chrome; the receipt preview itself
 * uses hardcoded hex (exactly like the public /r/[code] page).
 */

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { IconPalette, IconCheck, IconExternalLink } from "@tabler/icons-react";
import { supabase } from "@/lib/supabase";
import {
  resolveActiveBusiness,
  type BusinessResolution,
} from "@/lib/business";
import {
  brandColorOrDefault,
  textOn,
  accentOnWhite,
  RECEIPT_COLOR_SWATCHES,
} from "@/lib/receiptColor";

// ---------------------------------------------------------------------------
// Receipt preview — same fixed palette as /r/[code]
// ---------------------------------------------------------------------------

const C = {
  pageBg:     "#e5e7eb",
  cardBg:     "#ffffff",
  text:       "#111827",
  textSec:    "#6b7280",
  border:     "#e5e7eb",
  metaBg:     "#f9fafb",
  successBg:  "#1D9E75",
} as const;

function fmt(cents: number) {
  return "$" + (cents / 100).toFixed(2);
}

interface PreviewProps {
  bizName: string;
  brandColor: string;
}

function ReceiptPreview({ bizName, brandColor }: PreviewProps) {
  const brandText  = textOn(brandColor);
  const accentColor = accentOnWhite(brandColor);

  return (
    <div
      style={{
        colorScheme: "light",
        background: C.cardBg,
        color: C.text,
        borderRadius: 12,
        boxShadow: "0 2px 16px rgba(0,0,0,0.10)",
        maxWidth: 340,
        width: "100%",
        overflow: "hidden",
        fontSize: 13,
      }}
    >
      {/* Brand header */}
      <div
        style={{
          background: brandColor,
          padding: "20px 20px 16px",
          color: brandText,
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: `${brandText === "#ffffff" ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.10)"}`,
            margin: "0 auto 8px",
          }}
        />
        <div style={{ fontWeight: 700, fontSize: 15, color: brandText }}>{bizName}</div>
        <div style={{ fontSize: 11, opacity: 0.8, color: brandText }}>Ciudad, Estado</div>
      </div>

      {/* Paid badge */}
      <div style={{ textAlign: "center", padding: "12px 20px 0" }}>
        <span
          style={{
            display: "inline-block",
            background: C.successBg,
            color: "#fff",
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: "0.1em",
            padding: "3px 10px",
            borderRadius: 999,
          }}
        >
          PAGADO
        </span>
      </div>

      {/* Meta */}
      <div style={{ padding: "10px 20px 0" }}>
        <div
          style={{
            background: C.metaBg,
            borderRadius: 8,
            padding: "8px 12px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 6,
          }}
        >
          {[
            ["Mesa", "5"],
            ["Fecha", "Hoy"],
            ["Recibo #", "DEMO-001"],
          ].map(([k, v]) => (
            <>
              <span style={{ color: C.textSec }}>{k}</span>
              <span style={{ fontWeight: 600, color: C.text, textAlign: "right" }}>{v}</span>
            </>
          ))}
        </div>
      </div>

      {/* Items */}
      <div style={{ padding: "10px 20px 0" }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textSec, marginBottom: 4 }}>Productos</div>
        {[
          { name: "Tacos al pastor", qty: 2, price: 1800 },
          { name: "Agua de Jamaica", qty: 1, price: 600 },
        ].map((item, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}`, color: C.text }}>
            <span>{item.qty > 1 ? `${item.qty}× ` : ""}{item.name}</span>
            <span>{fmt(item.price * item.qty)}</span>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div style={{ padding: "10px 20px" }}>
        {[
          { label: "Subtotal", val: 4200 },
          { label: "Impuesto", val: 336 },
        ].map(({ label, val }) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", color: C.text }}>
            <span>{label}</span><span>{fmt(val)}</span>
          </div>
        ))}
        <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 6, paddingTop: 6, display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 15 }}>
          <span>Total</span>
          {/* ② TOTAL value in brand accent */}
          <span style={{ color: accentColor }}>{fmt(4536)}</span>
        </div>
      </div>

      {/* ③ Ver menú link */}
      <div style={{ padding: "0 20px 16px", textAlign: "center" }}>
        <span style={{ fontSize: 12, color: accentColor, fontWeight: 600 }}>
          Ver el menú →
        </span>
      </div>

      {/* ④ PDF button */}
      <div style={{ padding: "0 20px 20px", textAlign: "center" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 16px",
            borderRadius: 8,
            background: brandColor,
            color: brandText,
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          Descargar PDF
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Color picker component
// ---------------------------------------------------------------------------

interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
}

function ColorPicker({ value, onChange, disabled }: ColorPickerProps) {
  const t = useTranslations("dashboardCommon");
  const [customHex, setCustomHex] = useState(value);

  useEffect(() => {
    setCustomHex(value);
  }, [value]);

  return (
    <div>
      {/* Swatches */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: "var(--db-text-secondary)", marginBottom: 8 }}>
          {t("receiptBrandColorSwatchesLabel")}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {RECEIPT_COLOR_SWATCHES.map((hex) => (
            <button
              key={hex}
              type="button"
              disabled={disabled}
              onClick={() => { onChange(hex); setCustomHex(hex); }}
              title={hex}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: hex,
                border: value === hex ? "3px solid var(--db-text-primary)" : "2px solid transparent",
                boxShadow: value === hex ? "0 0 0 2px var(--db-bg-surface), 0 0 0 4px var(--db-text-primary)" : "0 1px 3px rgba(0,0,0,0.2)",
                cursor: disabled ? "not-allowed" : "pointer",
                padding: 0,
                flexShrink: 0,
              }}
            />
          ))}
        </div>
      </div>

      {/* Custom hex */}
      <div style={{ fontSize: 12, color: "var(--db-text-secondary)", marginBottom: 6 }}>
        {t("receiptBrandColorCustom")}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="color"
          value={customHex.startsWith("#") && customHex.length === 7 ? customHex : "#5C7CFA"}
          disabled={disabled}
          onChange={(e) => {
            setCustomHex(e.target.value);
            onChange(e.target.value);
          }}
          style={{
            width: 44,
            height: 36,
            borderRadius: 8,
            border: "1px solid var(--db-border)",
            padding: 2,
            cursor: disabled ? "not-allowed" : "pointer",
            background: "var(--db-bg-surface)",
          }}
        />
        <input
          type="text"
          value={customHex}
          disabled={disabled}
          placeholder="#5C7CFA"
          maxLength={7}
          onChange={(e) => {
            const v = e.target.value;
            setCustomHex(v);
            if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v);
          }}
          style={{
            flex: 1,
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid var(--db-border)",
            background: "var(--db-bg-surface)",
            color: "var(--db-text-primary)",
            fontSize: 13,
            fontFamily: "monospace",
            outline: "none",
          }}
        />
        {/* Live swatch */}
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: customHex,
            border: "1px solid var(--db-border)",
            flexShrink: 0,
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReceiptDashboardPage() {
  const t = useTranslations("dashboardCommon");
  const [bizId, setBizId]       = useState<string | null>(null);
  const [bizName, setBizName]   = useState("Tu Negocio");
  const [bizSlug, setBizSlug]   = useState<string | null>(null);
  const [color, setColor]       = useState("#5C7CFA");
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    let mounted = true;
    void resolveActiveBusiness().then(async (res: BusinessResolution) => {
      if (!mounted || !res.ok) { setLoading(false); return; }
      const biz = res.business;
      setBizId(biz.id);
      setBizName(biz.name);
      setBizSlug(biz.slug ?? null);

      // Load receipt_brand_color
      const { data } = await supabase
        .from("businesses")
        .select("receipt_brand_color")
        .eq("id", biz.id)
        .maybeSingle();
      if (mounted && data?.receipt_brand_color) {
        setColor(data.receipt_brand_color);
      }
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  const handleSave = useCallback(async () => {
    if (!bizId) return;
    setSaving(true);
    setSaved(false);
    const { error } = await supabase
      .from("businesses")
      .update({ receipt_brand_color: color })
      .eq("id", bizId);
    setSaving(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  }, [bizId, color]);

  const resolvedColor = brandColorOrDefault(color);

  return (
    <div>
      <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", marginBottom: "6px" }}>
        {t("receiptDashboardTitle")}
      </h1>
      <p style={{ fontSize: "14px", color: "var(--db-text-secondary)", marginBottom: "28px" }}>
        {t("receiptDashboardDesc")}
      </p>

      {loading ? (
        <p style={{ color: "var(--db-text-secondary)" }}>Cargando…</p>
      ) : !bizId ? (
        <p style={{ color: "var(--db-text-secondary)" }}>
          No hay negocio activo. Activa uno desde{" "}
          <a href="/dashboard/configuration/businesses" style={{ color: "var(--db-accent)" }}>
            Configuración › Negocios
          </a>
          .
        </p>
      ) : (
        <div
          style={{
            display: "flex",
            gap: 32,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          {/* Left — color picker + save */}
          <div
            style={{
              background: "var(--db-bg-surface)",
              border: "1px solid var(--db-border)",
              borderRadius: 14,
              padding: 24,
              minWidth: 280,
              flex: "0 0 auto",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <IconPalette size={20} style={{ color: "var(--db-accent)" }} />
              <span style={{ fontWeight: 700, fontSize: 15, color: "var(--db-text-primary)" }}>
                {t("receiptBrandColorLabel")}
              </span>
            </div>
            <p style={{ fontSize: 12, color: "var(--db-text-secondary)", marginBottom: 16 }}>
              {t("receiptBrandColorHint")}
            </p>

            <ColorPicker
              value={resolvedColor}
              onChange={setColor}
              disabled={saving}
            />

            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              style={{
                marginTop: 16,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 20px",
                borderRadius: 10,
                border: "none",
                background: "var(--db-accent)",
                color: "var(--db-accent-text)",
                fontWeight: 600,
                fontSize: 14,
                cursor: saving ? "wait" : "pointer",
                opacity: saving ? 0.7 : 1,
                width: "100%",
                justifyContent: "center",
              }}
            >
              {saved ? <IconCheck size={16} /> : null}
              {saving
                ? t("receiptBrandColorSaving")
                : saved
                ? t("receiptBrandColorSaved")
                : t("receiptBrandColorSave")}
            </button>

            {bizSlug && (
              <a
                href={`/m/${bizSlug}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 12,
                  fontSize: 13,
                  color: "var(--db-accent)",
                  textDecoration: "none",
                  justifyContent: "center",
                }}
              >
                <IconExternalLink size={14} />
                {t("receiptDashboardMenuLink")}
              </a>
            )}
          </div>

          {/* Right — receipt preview */}
          <div style={{ flex: "1 1 300px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--db-text-secondary)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12 }}>
              {t("receiptDashboardPreviewTitle")}
            </div>
            <ReceiptPreview bizName={bizName} brandColor={resolvedColor} />
          </div>
        </div>
      )}
    </div>
  );
}
