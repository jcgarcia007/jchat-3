"use client";

/**
 * JChat 3.0 — Dashboard › Recibo Digital
 *
 * Etapa 3: template selector + color picker.
 * Saves both receipt_template_id and receipt_brand_color in a single UPDATE.
 *
 * Uses --db-* tokens for dashboard chrome.
 * Receipt preview uses hardcoded hex (never theme tokens).
 */

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { IconPalette, IconCheck, IconExternalLink, IconLayout } from "@tabler/icons-react";
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
// Fixed palette (same as /r/[code] templates)
// ---------------------------------------------------------------------------
const C = {
  pageBg:    "#e5e7eb",
  cardBg:    "#ffffff",
  text:      "#111827",
  textSec:   "#6b7280",
  textTer:   "#9ca3af",
  border:    "#e5e7eb",
  metaBg:    "#f9fafb",
  successBg: "#1D9E75",
} as const;

function fmt(cents: number) {
  return "$" + (cents / 100).toFixed(2);
}

// ---------------------------------------------------------------------------
// Template definitions
// ---------------------------------------------------------------------------

type TemplateId = "modern" | "ticket" | "minimal" | "elegant";

interface TemplateDef {
  id: TemplateId;
  labelKey: string;
  descKey: string;
}

const TEMPLATES: TemplateDef[] = [
  { id: "modern",  labelKey: "receiptTemplateModernName",  descKey: "receiptTemplateModernDesc"  },
  { id: "ticket",  labelKey: "receiptTemplateTicketName",  descKey: "receiptTemplateTicketDesc"  },
  { id: "minimal", labelKey: "receiptTemplateMinimalName", descKey: "receiptTemplateMinimalDesc" },
  { id: "elegant", labelKey: "receiptTemplateElegantName", descKey: "receiptTemplateElegantDesc" },
];

// ---------------------------------------------------------------------------
// Mini receipt preview — approximates each template style
// ---------------------------------------------------------------------------

interface PreviewProps {
  bizName:    string;
  templateId: TemplateId;
  brandColor: string;
}

function ReceiptPreview({ bizName, templateId, brandColor }: PreviewProps) {
  const brandText   = textOn(brandColor);
  const accentColor = accentOnWhite(brandColor);

  const SAMPLE_ITEMS = [
    { name: "Tacos al pastor", qty: 2, price: 1800 },
    { name: "Agua de Jamaica", qty: 1, price: 600 },
  ];

  // Shared chip
  const PaidChip = () => (
    <span
      style={{
        display: "inline-block",
        background: C.successBg,
        color: "#fff",
        fontWeight: 700,
        fontSize: 9,
        letterSpacing: "0.1em",
        padding: "2px 8px",
        borderRadius: 999,
      }}
    >
      PAGADO
    </span>
  );

  // ── Modern ──────────────────────────────────────────────────────────────
  if (templateId === "modern") {
    return (
      <div style={{ colorScheme: "light", background: C.cardBg, color: C.text, borderRadius: 10, boxShadow: "0 2px 12px rgba(0,0,0,0.10)", maxWidth: 320, width: "100%", overflow: "hidden", fontSize: 11 }}>
        <div style={{ background: brandColor, padding: "14px 16px 12px", color: brandText, textAlign: "center" }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: `${brandText === "#ffffff" ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.10)"}`, margin: "0 auto 6px" }} />
          <div style={{ fontWeight: 700, fontSize: 13, color: brandText }}>{bizName}</div>
          <div style={{ fontSize: 9, opacity: 0.8, color: brandText }}>Ciudad, Estado</div>
        </div>
        <div style={{ textAlign: "center", padding: "8px 16px 0" }}><PaidChip /></div>
        <div style={{ padding: "8px 16px 0" }}>
          <div style={{ background: C.metaBg, borderRadius: 6, padding: "6px 10px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 10 }}>
            {[["Mesa", "5"], ["Fecha", "Hoy"]].map(([k, v]) => (
              <><span style={{ color: C.textSec }}>{k}</span><span style={{ fontWeight: 600, color: C.text, textAlign: "right" }}>{v}</span></>
            ))}
          </div>
        </div>
        <div style={{ padding: "8px 16px 0" }}>
          {SAMPLE_ITEMS.map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${C.border}`, color: C.text }}>
              <span>{item.qty > 1 ? `${item.qty}× ` : ""}{item.name}</span>
              <span>{fmt(item.price * item.qty)}</span>
            </div>
          ))}
        </div>
        <div style={{ padding: "6px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 10, color: C.textSec }}><span>Subtotal</span><span>$42.00</span></div>
          <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 4, paddingTop: 4, display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 13 }}>
            <span>Total</span><span style={{ color: accentColor }}>$45.36</span>
          </div>
        </div>
        <div style={{ padding: "0 16px 12px", textAlign: "center" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 12px", borderRadius: 6, background: brandColor, color: brandText, fontWeight: 600, fontSize: 10 }}>
            Descargar PDF
          </span>
        </div>
      </div>
    );
  }

  // ── Ticket ───────────────────────────────────────────────────────────────
  if (templateId === "ticket") {
    const MONO: React.CSSProperties = { fontFamily: '"Courier New", Courier, monospace' };
    return (
      <div style={{ colorScheme: "light", ...MONO, background: "#fdfaf5", color: "#1a1a1a", maxWidth: 260, width: "100%", boxShadow: "0 2px 12px rgba(0,0,0,0.12)", fontSize: 10 }}>
        <div style={{ background: brandColor, color: brandText, textAlign: "center", padding: "12px 16px 10px" }}>
          <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: "0.05em", color: brandText }}>{bizName.toUpperCase()}</div>
          <div style={{ fontSize: 9, opacity: 0.8, color: brandText }}>Ciudad, Estado</div>
        </div>
        <div style={{ padding: "10px 16px" }}>
          <div style={{ textAlign: "center", marginBottom: 8 }}><PaidChip /></div>
          <div style={{ borderTop: "1px dashed #d1c9b8", margin: "6px 0" }} />
          {[["MESA", "5"], ["FECHA", "Hoy"]].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#7a7060" }}>{k}</span><span style={{ fontWeight: 700 }}>{v}</span>
            </div>
          ))}
          <div style={{ borderTop: "1px dashed #d1c9b8", margin: "6px 0" }} />
          {SAMPLE_ITEMS.map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{item.qty > 1 ? `${item.qty}x ` : ""}{item.name}</span><span>{fmt(item.price * item.qty)}</span>
            </div>
          ))}
          <div style={{ borderTop: "1px dashed #d1c9b8", margin: "6px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 12 }}>
            <span>TOTAL</span><span style={{ color: accentColor }}>$45.36</span>
          </div>
          <div style={{ borderTop: "1px dashed #d1c9b8", margin: "6px 0" }} />
          <div style={{ textAlign: "center", fontSize: 9, color: "#7a7060", letterSpacing: "0.1em" }}>GRACIAS POR SU VISITA</div>
        </div>
      </div>
    );
  }

  // ── Minimal ───────────────────────────────────────────────────────────────
  if (templateId === "minimal") {
    return (
      <div style={{ colorScheme: "light", background: C.cardBg, color: C.text, maxWidth: 320, width: "100%", borderTop: `3px solid ${accentColor}`, boxShadow: "0 1px 8px rgba(0,0,0,0.06)", fontSize: 11 }}>
        <div style={{ padding: "24px 28px 16px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontWeight: 300, fontSize: 16, letterSpacing: "0.04em", color: C.text }}>{bizName}</div>
          <div style={{ fontSize: 10, color: C.textSec, fontWeight: 300, marginTop: 3, letterSpacing: "0.03em" }}>Ciudad, Estado</div>
        </div>
        <div style={{ padding: "12px 28px", display: "flex", alignItems: "center", gap: 16, borderBottom: `1px solid ${C.border}` }}>
          <PaidChip />
          <div>
            <div style={{ fontSize: 9, letterSpacing: "0.1em", color: C.textSec, fontWeight: 300, textTransform: "uppercase" }}>Mesa</div>
            <div style={{ fontSize: 11, color: C.text, fontWeight: 400 }}>5</div>
          </div>
        </div>
        <div style={{ padding: "12px 28px 0" }}>
          {SAMPLE_ITEMS.map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}`, fontWeight: 300 }}>
              <span>{item.qty > 1 ? <span style={{ color: accentColor, marginRight: 4 }}>{item.qty}×</span> : null}{item.name}</span>
              <span>{fmt(item.price * item.qty)}</span>
            </div>
          ))}
        </div>
        <div style={{ padding: "12px 28px 20px", borderTop: `1px solid ${C.border}`, marginTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.textSec, fontWeight: 300, paddingBottom: 6 }}><span>Subtotal</span><span>$42.00</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
            <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: C.textSec, fontWeight: 300 }}>Total</span>
            <span style={{ fontSize: 20, fontWeight: 300, color: accentColor }}>$45.36</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Elegant ───────────────────────────────────────────────────────────────
  const SERIF: React.CSSProperties = { fontFamily: "Georgia, 'Times New Roman', Times, serif" };
  return (
    <div style={{ colorScheme: "light", ...SERIF, background: "#faf8f5", color: C.text, maxWidth: 320, width: "100%", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", border: `1px solid ${C.border}`, fontSize: 11 }}>
      <div style={{ height: 2, background: accentColor }} />
      <div style={{ padding: "24px 28px 16px", textAlign: "center", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontStyle: "italic", fontWeight: 400, fontSize: 17, color: C.text }}>{bizName}</div>
        <div style={{ fontSize: 10, color: C.textSec, marginTop: 4, letterSpacing: "0.04em" }}>Ciudad, Estado</div>
      </div>
      <div style={{ padding: "12px 28px", textAlign: "center", borderBottom: `1px solid ${C.border}` }}>
        <PaidChip />
      </div>
      <div style={{ padding: "10px 28px 0" }}>
        {SAMPLE_ITEMS.map((item, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
            <span>{item.name}</span><span>{fmt(item.price * item.qty)}</span>
          </div>
        ))}
      </div>
      <div style={{ padding: "10px 28px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.textSec, paddingBottom: 6 }}>
          <span style={{ fontVariant: "small-caps" }}>Subtotal</span><span>$42.00</span>
        </div>
        <div style={{ borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, paddingTop: 2, marginBottom: 6 }}><div style={{ borderTop: `1px solid ${C.border}`, marginTop: 3 }} /></div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontVariant: "small-caps", fontSize: 12 }}>Total</span>
          <span style={{ fontSize: 20, fontStyle: "italic", color: accentColor }}>$45.36</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Template selector card
// ---------------------------------------------------------------------------

function TemplateSelector({
  value,
  onChange,
  disabled,
}: {
  value: TemplateId;
  onChange: (id: TemplateId) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("dashboardCommon");
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      {TEMPLATES.map((tpl) => {
        const active = value === tpl.id;
        return (
          <button
            key={tpl.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(tpl.id)}
            style={{
              textAlign: "left",
              padding: "12px 14px",
              borderRadius: 10,
              border: active
                ? "2px solid var(--db-accent)"
                : "2px solid var(--db-border)",
              background: active ? "var(--db-accent-soft, rgba(92,124,250,0.08))" : "var(--db-bg-surface)",
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.7 : 1,
              transition: "border-color 0.15s, background 0.15s",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--db-text-primary)", marginBottom: 3 }}>
              {t(tpl.labelKey)}
              {active && (
                <span
                  style={{
                    display: "inline-flex",
                    marginLeft: 6,
                    background: "var(--db-accent)",
                    color: "var(--db-accent-text)",
                    borderRadius: 999,
                    padding: "1px 7px",
                    fontSize: 10,
                    fontWeight: 700,
                    verticalAlign: "middle",
                  }}
                >
                  ✓
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: "var(--db-text-secondary)", lineHeight: 1.4 }}>
              {t(tpl.descKey)}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Color picker (from Etapa 2, unchanged)
// ---------------------------------------------------------------------------

function ColorPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("dashboardCommon");
  const [customHex, setCustomHex] = useState(value);

  useEffect(() => { setCustomHex(value); }, [value]);

  return (
    <div>
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
                width: 32, height: 32, borderRadius: 8, background: hex, padding: 0, flexShrink: 0,
                border: value === hex ? "3px solid var(--db-text-primary)" : "2px solid transparent",
                boxShadow: value === hex
                  ? "0 0 0 2px var(--db-bg-surface), 0 0 0 4px var(--db-text-primary)"
                  : "0 1px 3px rgba(0,0,0,0.2)",
                cursor: disabled ? "not-allowed" : "pointer",
              }}
            />
          ))}
        </div>
      </div>

      <div style={{ fontSize: 12, color: "var(--db-text-secondary)", marginBottom: 6 }}>
        {t("receiptBrandColorCustom")}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="color"
          value={customHex.startsWith("#") && customHex.length === 7 ? customHex : "#5C7CFA"}
          disabled={disabled}
          onChange={(e) => { setCustomHex(e.target.value); onChange(e.target.value); }}
          style={{ width: 44, height: 36, borderRadius: 8, border: "1px solid var(--db-border)", padding: 2, cursor: disabled ? "not-allowed" : "pointer", background: "var(--db-bg-surface)" }}
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
          style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--db-border)", background: "var(--db-bg-surface)", color: "var(--db-text-primary)", fontSize: 13, fontFamily: "monospace", outline: "none" }}
        />
        <div style={{ width: 36, height: 36, borderRadius: 8, background: customHex, border: "1px solid var(--db-border)", flexShrink: 0 }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReceiptDashboardPage() {
  const t = useTranslations("dashboardCommon");

  const [bizId,       setBizId]       = useState<string | null>(null);
  const [bizName,     setBizName]     = useState("Tu Negocio");
  const [bizSlug,     setBizSlug]     = useState<string | null>(null);
  const [color,       setColor]       = useState("#5C7CFA");
  const [templateId,  setTemplateId]  = useState<TemplateId>("modern");
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    let mounted = true;
    void resolveActiveBusiness().then(async (res: BusinessResolution) => {
      if (!mounted || !res.ok) { setLoading(false); return; }
      const biz = res.business;
      setBizId(biz.id);
      setBizName(biz.name);
      setBizSlug(biz.slug ?? null);

      const { data } = await supabase
        .from("businesses")
        .select("receipt_brand_color, receipt_template_id")
        .eq("id", biz.id)
        .maybeSingle();

      if (mounted) {
        if (data?.receipt_brand_color) setColor(data.receipt_brand_color);
        if (data?.receipt_template_id) setTemplateId(data.receipt_template_id as TemplateId);
        setLoading(false);
      }
    });
    return () => { mounted = false; };
  }, []);

  // Save both color + template in ONE update
  const handleSave = useCallback(async () => {
    if (!bizId) return;
    setSaving(true);
    setSaved(false);
    const { error } = await supabase
      .from("businesses")
      .update({ receipt_brand_color: color, receipt_template_id: templateId })
      .eq("id", bizId);
    setSaving(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  }, [bizId, color, templateId]);

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
          </a>.
        </p>
      ) : (
        <div style={{ display: "flex", gap: 32, alignItems: "flex-start", flexWrap: "wrap" }}>

          {/* Left — controls */}
          <div
            style={{
              background: "var(--db-bg-surface)",
              border: "1px solid var(--db-border)",
              borderRadius: 14,
              padding: 24,
              minWidth: 280,
              maxWidth: 380,
              flex: "0 0 auto",
              display: "flex",
              flexDirection: "column",
              gap: 24,
            }}
          >
            {/* Template selector */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <IconLayout size={18} style={{ color: "var(--db-accent)" }} />
                <span style={{ fontWeight: 700, fontSize: 14, color: "var(--db-text-primary)" }}>
                  {t("receiptTemplateSectionTitle")}
                </span>
              </div>
              <p style={{ fontSize: 12, color: "var(--db-text-secondary)", marginBottom: 12, lineHeight: 1.5 }}>
                {t("receiptTemplateSectionDesc")}
              </p>
              <TemplateSelector value={templateId} onChange={setTemplateId} disabled={saving} />
            </div>

            {/* Divider */}
            <div style={{ borderTop: "1px solid var(--db-border)" }} />

            {/* Color picker */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <IconPalette size={18} style={{ color: "var(--db-accent)" }} />
                <span style={{ fontWeight: 700, fontSize: 14, color: "var(--db-text-primary)" }}>
                  {t("receiptBrandColorLabel")}
                </span>
              </div>
              <p style={{ fontSize: 12, color: "var(--db-text-secondary)", marginBottom: 12 }}>
                {t("receiptBrandColorHint")}
              </p>
              <ColorPicker value={resolvedColor} onChange={setColor} disabled={saving} />
            </div>

            {/* Save button — saves both fields */}
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "10px 20px", borderRadius: 10, border: "none",
                background: "var(--db-accent)", color: "var(--db-accent-text)",
                fontWeight: 600, fontSize: 14, cursor: saving ? "wait" : "pointer",
                opacity: saving ? 0.7 : 1, width: "100%", justifyContent: "center",
              }}
            >
              {saved ? <IconCheck size={16} /> : null}
              {saving
                ? t("receiptBrandColorSaving")
                : saved
                ? t("receiptBrandColorSaved")
                : t("receiptTemplateSave")}
            </button>

            {bizSlug && (
              <a
                href={`/m/${bizSlug}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "flex", alignItems: "center", gap: 6, marginTop: -8,
                  fontSize: 13, color: "var(--db-accent)", textDecoration: "none", justifyContent: "center",
                }}
              >
                <IconExternalLink size={14} />
                {t("receiptDashboardMenuLink")}
              </a>
            )}
          </div>

          {/* Right — live preview */}
          <div style={{ flex: "1 1 300px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--db-text-secondary)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12 }}>
              {t("receiptDashboardPreviewTitle")}
            </div>
            <ReceiptPreview
              bizName={bizName}
              templateId={templateId}
              brandColor={resolvedColor}
            />
          </div>
        </div>
      )}
    </div>
  );
}
