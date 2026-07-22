"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { fmtPrice } from "./templates/shared/format";
import MenuTemplateRenderer from "./templates/MenuTemplateRenderer";
import { resolvePalette, type MenuPalette } from "./templates/shared/palettes";
import { COLOR_PALETTES_BY_SLUG } from "./templates/shared/colorPalettes";
import { MenuPaletteContext } from "./templates/shared/paletteContext";
import { IconShoppingCart } from "@tabler/icons-react";
import { CheckoutStep } from "./CheckoutStep";
import { supabase } from "@/lib/supabase";
import { TABLE_CONTEXT_KEY } from "../../t/[token]/TableEntry";
import type {
  PublicBusiness,
  PublicMenuCategory,
  PublicMenuItem,
  MenuItemOption,
  ModifierChoice,
} from "./page";

// ── Cart types ────────────────────────────────────────────────────────────────

interface GroupSelection {
  groupId: string;
  groupLabel: string;
  choices: ModifierChoice[];
}

interface CartItem {
  cartId: string;
  itemId: string;
  name: string;
  basePriceCents: number;
  quantity: number;
  /** Legacy compat fields — kept so CartSheet/PickupSheet render unchanged for old items */
  selectedSize: MenuItemOption | null;
  selectedExtras: MenuItemOption[];
  /** New unified selections (one entry per group) */
  groupSelections: GroupSelection[];
  lineTotalCents: number;
  notes?: string;
}

type AppStep = "menu" | "cart" | "pickup" | "pay";
type PickupType = "counter" | "table";

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcLine(
  base: number,
  size: MenuItemOption | null,
  extras: MenuItemOption[],
  qty: number
): number {
  return (base + (size?.price_cents ?? 0) + extras.reduce((s, e) => s + e.price_cents, 0)) * qty;
}

function calcLineFromGroups(base: number, groups: GroupSelection[], qty: number): number {
  const extra = groups.reduce(
    (sum, g) => sum + g.choices.reduce((s, c) => s + c.price_cents, 0),
    0
  );
  return (base + extra) * qty;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function BusinessHeader({ biz }: { biz: PublicBusiness }) {
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      {/* Cover */}
      <div
        style={{
          width: "100%",
          height: 220,
          background: biz.cover_url
            ? `url(${biz.cover_url}) center/cover no-repeat`
            : "linear-gradient(135deg, var(--color-brand) 0%, var(--color-brand-purple) 100%)",
          position: "relative",
        }}
        role="img"
        aria-label={`Portada de ${biz.name}`}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(10,10,20,0.85) 100%)",
          }}
        />
      </div>

      {/* Identity */}
      <div
        style={{
          maxWidth: 680,
          margin: "0 auto",
          padding: "0 16px",
          display: "flex",
          alignItems: "flex-end",
          gap: 14,
          marginTop: -36,
          position: "relative",
          zIndex: 2,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 18,
            background: "var(--bg-elevated)",
            border: "3px solid var(--bg-base)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 36,
            flexShrink: 0,
            boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
          }}
        >
          {biz.icon_emoji ?? "🍴"}
        </div>
        <div style={{ paddingBottom: 4, minWidth: 0 }}>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: "0 0 4px",
              lineHeight: 1.2,
            }}
          >
            {biz.name}
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ color: "var(--color-gold)", fontSize: 13 }}>★</span>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              {biz.category ?? "Restaurante"}
            </span>
          </div>
        </div>
      </div>

      {biz.description && (
        <div
          style={{
            maxWidth: 680,
            margin: "0 auto",
            padding: "0 16px 12px",
          }}
        >
          <p
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            {biz.description}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Customizer Sheet ──────────────────────────────────────────────────────────

function CustomizerSheet({
  palette,
  item,
  onClose,
  onAddToCart,
}: {
  palette: MenuPalette;
  item: PublicMenuItem;
  onClose: () => void;
  onAddToCart: (
    item: PublicMenuItem,
    size: MenuItemOption | null,
    extras: MenuItemOption[],
    qty: number,
    groupSelections: GroupSelection[],
    notes?: string
  ) => void;
}) {
  // Pre-select defaults: single groups get default index (hielo->2, picante->1, rest->0)
  const [singleSel, setSingleSel] = useState<Record<string, ModifierChoice | null>>(() => {
    const init: Record<string, ModifierChoice | null> = {};
    for (const g of item.groups) {
      if (g.type === "single" && g.choices.length > 0) {
        const key = (g.label + g.id).toLowerCase();
        const isIce = key.includes("hielo") || key.includes("ice");
        const isSpice = key.includes("picante") || key.includes("spice");
        const idx = isIce ? 2 : isSpice ? 1 : 0;
        init[g.id] = g.choices[Math.min(idx, g.choices.length - 1)];
      }
    }
    return init;
  });
  const [multiSel, setMultiSel] = useState<Record<string, Set<string>>>({});
  const [qty, setQty] = useState(1);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [notes, setNotes] = useState("");
  const toggleMulti = useCallback(
    (groupId: string, choice: ModifierChoice, maxSelect: number) => {
      setMultiSel((prev) => {
        const cur = new Set(prev[groupId] ?? []);
        if (cur.has(choice.label)) {
          cur.delete(choice.label);
        } else if (cur.size < maxSelect) {
          cur.add(choice.label);
        }
        return { ...prev, [groupId]: cur };
      });
    },
    []
  );

  // Build GroupSelection[] from current state
  const groupSelections: GroupSelection[] = item.groups
    .map((g) => {
      if (g.type === "single") {
        const c = singleSel[g.id] ?? null;
        return c ? { groupId: g.id, groupLabel: g.label, choices: [c] } : null;
      } else {
        const sel = multiSel[g.id] ?? new Set<string>();
        const chosen = g.choices.filter((c) => sel.has(c.label));
        return chosen.length > 0
          ? { groupId: g.id, groupLabel: g.label, choices: chosen }
          : null;
      }
    })
    .filter((gs): gs is GroupSelection => gs !== null);

  const totalCents = calcLineFromGroups(item.price_cents, groupSelections, qty);

  const allUrls: string[] = item.photos.length > 0
    ? item.photos.map((p) => p.url)
    : item.photo_url
    ? [item.photo_url]
    : [];
  const displayUrl = allUrls[Math.min(photoIdx, allUrls.length - 1)] ?? null;

  const sheetInputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: `1.5px solid ${palette.border}`,
    background: palette.surface,
    color: palette.text,
    fontSize: 14,
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box",
  };

  return (
    <Backdrop onClose={onClose} palette={palette}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: palette.surfaceElevated,
          borderRadius: "20px 20px 0 0",
          overflow: "hidden",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          width: "100%",
          maxWidth: 460,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        {/* Photo area */}
        <div style={{ flexShrink: 0 }}>
          <div style={{ position: "relative", height: 218 }}>
            {displayUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={displayUrl}
                alt={item.name}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  background:
                    (palette.accentGradient ?? palette.accent),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 56,
                }}
              >
                🍽️
              </div>
            )}
            <button
              onClick={onClose}
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                width: 34,
                height: 34,
                borderRadius: "50%",
                background: "rgba(0,0,0,0.55)",
                border: "none",
                color: palette.accentText,
                fontSize: 18,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          {/* Photo thumbnails */}
          {allUrls.length > 1 && (
            <div
              style={{
                display: "flex",
                gap: 8,
                padding: "10px 16px",
                overflowX: "auto",
                background: palette.surfaceElevated,
              }}
            >
              {allUrls.map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={url}
                  alt=""
                  onClick={() => setPhotoIdx(i)}
                  style={{
                    width: 42,
                    height: 42,
                    objectFit: "cover",
                    borderRadius: 8,
                    flexShrink: 0,
                    cursor: "pointer",
                    border: i === photoIdx
                      ? `2.5px solid ${palette.price}`
                      : "2px solid transparent",
                    opacity: i === photoIdx ? 1 : 0.65,
                    transition: "opacity .15s, border-color .15s",
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: "auto", flex: 1, padding: "16px 16px 8px" }}>
          {/* Name + base price */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 4,
            }}
          >
            <h3
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: palette.text,
                margin: 0,
                flex: 1,
                paddingRight: 12,
              }}
            >
              {item.name}
            </h3>
            <span
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: palette.price,
                flexShrink: 0,
              }}
            >
              {fmtPrice(item.price_cents)}
            </span>
          </div>
          {item.description && (
            <p
              style={{
                fontSize: 13,
                color: palette.textMuted,
                lineHeight: 1.6,
                margin: "0 0 18px",
              }}
            >
              {item.description}
            </p>
          )}

          {/* Modifier groups */}
          {item.groups.map((group) => {
            const multiSet = multiSel[group.id] ?? new Set<string>();
            const atMax = group.type === "multi" && multiSet.size >= group.max_select;

            return (
              <div key={group.id} style={{ marginBottom: 20 }}>
                {/* Group header */}
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: palette.textMuted,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 10,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {group.label}
                  {group.type === "multi" && group.max_select < group.choices.length && (
                    <span style={{ fontSize: 11, color: palette.textFaint, textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
                      · hasta {group.max_select}
                    </span>
                  )}
                  {group.type === "multi" && group.min_select > 0 && (
                    <span style={{ fontSize: 11, color: palette.danger, textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>
                      · mín {group.min_select}
                    </span>
                  )}
                </div>

                {/* Single-choice: horizontal chips */}
                {group.type === "single" && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {group.choices.map((choice) => {
                      const active = singleSel[group.id]?.label === choice.label;
                      return (
                        <button
                          key={choice.label}
                          onClick={() => setSingleSel((prev) => ({ ...prev, [group.id]: choice }))}
                          style={{
                            padding: "8px 14px",
                            borderRadius: 10,
                            border: active
                              ? `2px solid ${palette.price}`
                              : `1.5px solid ${palette.border}`,
                            background: active
                              ? palette.accentSoft
                              : palette.surface,
                            color: active ? palette.price : palette.text,
                            fontWeight: active ? 600 : 400,
                            fontSize: 13.5,
                            cursor: "pointer",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 2,
                            transition: "border-color .15s, background .15s",
                          }}
                        >
                          <span>{choice.label}</span>
                          {choice.price_cents !== 0 && (
                            <span style={{ fontSize: 11, color: active ? palette.price : palette.textMuted, fontWeight: 500 }}>
                              {choice.price_cents > 0 ? "+" : "−"}{fmtPrice(Math.abs(choice.price_cents))}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Multi-choice: checkbox rows */}
                {group.type === "multi" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {group.choices.map((choice) => {
                      const active = multiSet.has(choice.label);
                      const disabled = !active && atMax;
                      return (
                        <button
                          key={choice.label}
                          disabled={disabled}
                          onClick={() => toggleMulti(group.id, choice, group.max_select)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "10px 4px",
                            borderRadius: 10,
                            border: "none",
                            background: active ? palette.accentSoft : "transparent",
                            cursor: disabled ? "not-allowed" : "pointer",
                            opacity: disabled ? 0.4 : 1,
                            width: "100%",
                            textAlign: "left",
                          }}
                        >
                          <span
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 6,
                              border: active ? "none" : `2px solid ${palette.border}`,
                              background: active ? palette.price : "transparent",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                              transition: "background .15s",
                            }}
                          >
                            {active && <span style={{ color: palette.accentText, fontSize: 13, lineHeight: 1, fontWeight: 700 }}>✓</span>}
                          </span>
                          <span style={{ flex: 1, fontSize: 14, color: palette.text, fontWeight: active ? 500 : 400 }}>
                            {choice.label}
                          </span>
                          {choice.price_cents > 0 && (
                            <span style={{ fontSize: 13, color: palette.textMuted, fontWeight: 500, paddingRight: 4 }}>
                              +{fmtPrice(choice.price_cents)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Notes */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: palette.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
              Notas para la cocina
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Sin cebolla, extra salsa..."
              rows={2}
              maxLength={200}
              style={{ ...sheetInputStyle, resize: "none" }}
            />
          </div>

          <div style={{ height: 8 }} />
        </div>

        {/* Fixed bottom bar: qty stepper + add button */}
        <div
          style={{
            padding: "12px 16px",
            paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
            background: palette.surfaceElevated,
            borderTop: `1px solid ${palette.border}`,
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          {/* Qty stepper */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              borderRadius: 12,
              overflow: "hidden",
              border: `1.5px solid ${palette.border}`,
              flexShrink: 0,
            }}
          >
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              style={{
                width: 38,
                height: 42,
                border: "none",
                background: palette.surface,
                color: palette.text,
                fontSize: 20,
                cursor: "pointer",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              −
            </button>
            <span
              style={{
                width: 32,
                textAlign: "center",
                fontWeight: 700,
                fontSize: 15,
                color: palette.text,
                background: palette.surfaceElevated,
              }}
            >
              {qty}
            </span>
            <button
              onClick={() => setQty((q) => q + 1)}
              style={{
                width: 38,
                height: 42,
                border: "none",
                background: palette.surface,
                color: palette.text,
                fontSize: 20,
                cursor: "pointer",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              +
            </button>
          </div>

          {/* Add button */}
          <button
            onClick={() => onAddToCart(item, null, [], qty, groupSelections, notes)}
            style={{
              flex: 1,
              padding: "12px 14px",
              borderRadius: 12,
              border: "none",
              background: (palette.accentGradient ?? palette.accent),
              color: palette.accentText,
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>Agregar al pedido</span>
            <span>{fmtPrice(totalCents)}</span>
          </button>
        </div>
      </div>
    </Backdrop>
  );
}

// ── Cart Sheet ────────────────────────────────────────────────────────────────

function CartSheet({
  palette,
  cartItems,
  onClose,
  onUpdateQty,
  onRemove,
  onContinue,
}: {
  palette: MenuPalette;
  cartItems: CartItem[];
  onClose: () => void;
  onUpdateQty: (cartId: string, delta: number) => void;
  onRemove: (cartId: string) => void;
  onContinue: () => void;
}) {
  const subtotal = cartItems.reduce((s, i) => s + i.lineTotalCents, 0);

  return (
    <Backdrop onClose={onClose} palette={palette}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: palette.surfaceElevated,
          borderRadius: "20px 20px 0 0",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          width: "100%",
          maxWidth: 460,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 16px 12px",
            borderBottom: `1px solid ${palette.border}`,
            flexShrink: 0,
          }}
        >
          <h2
            style={{ fontSize: 17, fontWeight: 700, color: palette.text, margin: 0, display: "flex", alignItems: "center", gap: 8 }}
          >
            <IconShoppingCart size={20} style={{ color: palette.accent }} />Tu carrito
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: palette.textFaint,
              fontSize: 16,
              cursor: "pointer",
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "12px 16px" }}>
          {cartItems.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "40px 0",
                color: palette.textFaint,
                fontSize: 14,
              }}
            >
              <div style={{ marginBottom: 8, display: "flex", justifyContent: "center" }}><IconShoppingCart size={40} style={{ color: palette.textFaint }} /></div>
              Tu carrito está vacío
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {cartItems.map((ci) => (
                <div
                  key={ci.cartId}
                  style={{
                    background: palette.surface,
                    borderRadius: 12,
                    padding: "12px 14px",
                    border: `1px solid ${palette.border}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: palette.text,
                        flex: 1,
                        paddingRight: 8,
                      }}
                    >
                      {ci.name}
                    </span>
                    <button
                      onClick={() => onRemove(ci.cartId)}
                      style={{
                        background: "none",
                        border: "none",
                        color: palette.danger,
                        cursor: "pointer",
                        fontSize: 14,
                        padding: 0,
                        flexShrink: 0,
                      }}
                    >
                      ✕
                    </button>
                  </div>

                  {(ci.groupSelections.length > 0 ||
                    ci.selectedSize ||
                    ci.selectedExtras.length > 0) && (
                    <div
                      style={{
                        fontSize: 11,
                        color: palette.textFaint,
                        marginBottom: ci.notes ? 4 : 8,
                        lineHeight: 1.5,
                      }}
                    >
                      {ci.groupSelections.length > 0
                        ? ci.groupSelections
                            .flatMap((gs) => gs.choices.map((c) => c.label))
                            .join(" · ")
                        : [
                            ci.selectedSize?.label,
                            ...ci.selectedExtras.map((e) => e.label),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                    </div>
                  )}
                  {ci.notes && (
                    <div
                      style={{
                        fontSize: 11,
                        color: palette.textFaint,
                        fontStyle: "italic",
                        marginBottom: 8,
                        lineHeight: 1.5,
                      }}
                    >
                      📝 {ci.notes}
                    </div>
                  )}

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <button
                        onClick={() => onUpdateQty(ci.cartId, -1)}
                        style={smallQtyBtnStyle(palette)}
                      >
                        −
                      </button>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: palette.text,
                          minWidth: 20,
                          textAlign: "center",
                        }}
                      >
                        {ci.quantity}
                      </span>
                      <button
                        onClick={() => onUpdateQty(ci.cartId, 1)}
                        style={smallQtyBtnStyle(palette)}
                      >
                        +
                      </button>
                    </div>
                    <span
                      style={{ fontSize: 14, fontWeight: 700, color: palette.price }}
                    >
                      {fmtPrice(ci.lineTotalCents)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          style={{
            padding: "12px 16px 24px",
            borderTop: `1px solid ${palette.border}`,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 14,
            }}
          >
            <span style={{ fontSize: 14, color: palette.textMuted, fontWeight: 500 }}>
              Subtotal
            </span>
            <span style={{ fontSize: 18, fontWeight: 700, color: palette.text }}>
              {fmtPrice(subtotal)}
            </span>
          </div>
          <button
            onClick={onContinue}
            disabled={cartItems.length === 0}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: 14,
              border: "none",
              background:
                cartItems.length > 0
                  ? (palette.accentGradient ?? palette.accent)
                  : palette.surface,
              color: cartItems.length > 0 ? palette.accentText : palette.textFaint,
              fontSize: 15,
              fontWeight: 700,
              cursor: cartItems.length > 0 ? "pointer" : "not-allowed",
            }}
          >
            Continuar
          </button>
        </div>
      </div>
    </Backdrop>
  );
}

// ── Pickup Sheet ──────────────────────────────────────────────────────────────

function PickupSheet({
  palette,
  cartItems,
  initialTableNumber,
  initialName,
  onBack,
  onConfirm,
}: {
  palette: MenuPalette;
  cartItems: CartItem[];
  initialTableNumber: string;
  initialName: string;
  onBack: () => void;
  onConfirm: (type: PickupType, tableNumber: string, name: string) => void;
}) {
  const [pickupType, setPickupType] = useState<PickupType>("table");
  const [tableNumber, setTableNumber] = useState(initialTableNumber);
  const [name, setName] = useState(initialName);
  // Si el nombre del perfil llega DESPUÉS de montar esta hoja, rellénalo —
  // salvo que el usuario ya haya escrito algo (entonces gana lo suyo).
  const nameTouchedRef = useRef(false);
  useEffect(() => {
    if (!nameTouchedRef.current) setName(initialName);
  }, [initialName]);
  const subtotal = cartItems.reduce((s, i) => s + i.lineTotalCents, 0);
  const canConfirm = pickupType === "counter" || tableNumber.trim().length > 0;

  return (
    <Backdrop onClose={onBack} palette={palette}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: palette.surfaceElevated,
          borderRadius: "20px 20px 0 0",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          width: "100%",
          maxWidth: 460,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "16px 16px 12px",
            borderBottom: `1px solid ${palette.border}`,
            flexShrink: 0,
          }}
        >
          <button
            onClick={onBack}
            style={{
              background: "none",
              border: "none",
              color: palette.textMuted,
              cursor: "pointer",
              fontSize: 20,
              padding: 0,
              lineHeight: 1,
            }}
          >
            ←
          </button>
          <h2
            style={{ fontSize: 17, fontWeight: 700, color: palette.text, margin: 0 }}
          >
            ¿Cómo quieres recibir tu pedido?
          </h2>
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            {(
              [
                {
                  type: "table" as PickupType,
                  label: "🪑 En mi mesa",
                  desc: "Te lo llevamos a tu mesa",
                },
                {
                  type: "counter" as PickupType,
                  label: "🍽️ En la barra",
                  desc: "Recoge en el counter cuando esté listo",
                },
              ] as const
            ).map(({ type, label, desc }) => {
              const active = pickupType === type;
              return (
                <button
                  key={type}
                  onClick={() => setPickupType(type)}
                  style={{
                    padding: "14px 16px",
                    borderRadius: 14,
                    border: active
                      ? `2px solid ${palette.accent}`
                      : `1px solid ${palette.border}`,
                    background: active ? palette.accentSoft : palette.surface,
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%",
                  }}
                >
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: active ? palette.accent : palette.text,
                      marginBottom: 3,
                    }}
                  >
                    {label}
                  </div>
                  <div style={{ fontSize: 12, color: palette.textFaint }}>{desc}</div>
                </button>
              );
            })}
          </div>

          {pickupType === "table" && (
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: palette.textMuted,
                  display: "block",
                  marginBottom: 8,
                }}
              >
                Número de mesa
              </label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="Ej: 12"
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: `1px solid ${palette.border}`,
                  background: palette.surface,
                  color: palette.text,
                  fontSize: 15,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
          )}

          <div style={{ marginBottom: 20 }}>
            <label
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: palette.textMuted,
                display: "block",
                marginBottom: 8,
              }}
            >
              Nombre (opcional)
            </label>
            <input
              type="text"
              maxLength={60}
              placeholder="Tu nombre"
              value={name}
              onChange={(e) => { nameTouchedRef.current = true; setName(e.target.value); }}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 12,
                border: `1px solid ${palette.border}`,
                background: palette.surface,
                color: palette.text,
                fontSize: 15,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div
            style={{
              background: palette.surface,
              borderRadius: 14,
              padding: "14px 16px",
              border: `1px solid ${palette.border}`,
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: palette.textFaint,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 10,
              }}
            >
              Resumen del pedido
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {cartItems.map((ci) => (
                <div
                  key={ci.cartId}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 13, color: palette.textMuted, flex: 1 }}>
                    {ci.quantity}× {ci.name}
                    {ci.groupSelections.length > 0
                      ? ` (${ci.groupSelections.flatMap((gs) => gs.choices.map((c) => c.label)).join(", ")})`
                      : ci.selectedSize
                      ? ` (${ci.selectedSize.label})`
                      : ""}
                  </span>
                  <span
                    style={{ fontSize: 13, fontWeight: 600, color: palette.text, flexShrink: 0 }}
                  >
                    {fmtPrice(ci.lineTotalCents)}
                  </span>
                </div>
              ))}
            </div>
            <div
              style={{
                borderTop: `1px solid ${palette.border}`,
                marginTop: 10,
                paddingTop: 10,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 700, color: palette.text }}>
                Total
              </span>
              <span style={{ fontSize: 16, fontWeight: 700, color: palette.price }}>
                {fmtPrice(subtotal)}
              </span>
            </div>
          </div>
        </div>

        <div
          style={{
            padding: "12px 16px 24px",
            borderTop: `1px solid ${palette.border}`,
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => canConfirm && onConfirm(pickupType, tableNumber.trim(), name.trim())}
            disabled={!canConfirm}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: 14,
              border: "none",
              background: canConfirm
                ? "linear-gradient(135deg, #059669 0%, #0d9488 100%)"
                : palette.surface,
              color: canConfirm ? palette.accentText : palette.textFaint,
              fontSize: 15,
              fontWeight: 700,
              cursor: canConfirm ? "pointer" : "not-allowed",
            }}
          >
            Ir a pagar
          </button>
          {pickupType === "table" && !tableNumber.trim() && (
            <p
              style={{
                fontSize: 11,
                color: palette.danger,
                textAlign: "center",
                margin: "8px 0 0",
              }}
            >
              Ingresa el número de mesa
            </p>
          )}
        </div>
      </div>
    </Backdrop>
  );
}

// ── Backdrop ──────────────────────────────────────────────────────────────────

function Backdrop({
  children,
  onClose,
  palette,
}: {
  children: React.ReactNode;
  onClose: () => void;
  palette: MenuPalette;
}) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Rendered via a portal to document.body so the fixed overlay anchors to the
  // real viewport. The responsive menu shell (<main> with transform:
  // translateZ(0)) establishes a containing block for position:fixed, which
  // would otherwise pin the sheet to the scrolled shell instead of the screen.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: palette.overlay,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        alignItems: "center",
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

// ── Shared button styles ──────────────────────────────────────────────────────

const smallQtyBtnStyle = (palette: MenuPalette): React.CSSProperties => ({
  width: 28,
  height: 28,
  borderRadius: "50%",
  border: `1px solid ${palette.border}`,
  background: palette.surface,
  color: palette.text,
  fontSize: 16,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 700,
  lineHeight: 1,
});

// ── Cart FAB ──────────────────────────────────────────────────────────────────

function CartFAB({
  count,
  total,
  onClick,
}: {
  count: number;
  total: number;
  onClick: () => void;
}) {
  if (count === 0) return null;

  return (
    <button
      onClick={onClick}
      style={{
        position: "sticky",
        bottom: 24,
        marginLeft: "auto",
        marginRight: "auto",
        width: "fit-content",
        zIndex: 30,
        background:
          "linear-gradient(135deg, var(--color-brand) 0%, var(--color-brand-purple) 100%)",
        color: "#fff",
        border: "none",
        borderRadius: 24,
        padding: "14px 24px",
        fontSize: 15,
        fontWeight: 700,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 12,
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          background: "rgba(255,255,255,0.25)",
          borderRadius: 12,
          padding: "2px 8px",
          fontSize: 13,
        }}
      >
        {count}
      </span>
      <IconShoppingCart size={20} style={{ marginRight: -4 }} />
      Ver carrito · {fmtPrice(total)}
    </button>
  );
}

// ── Main MenuPageClient ───────────────────────────────────────────────────────

export default function MenuPageClient({
  business,
  categories,
}: {
  business: PublicBusiness;
  categories: PublicMenuCategory[];
}) {
  const cardEffect = business.menu_card_effect ?? "lift";
  // Resolve the active palette: a business-chosen custom palette (from the
  // 40-palette catalog) overrides the template's original board palette;
  // null / unknown slug falls back to the board palette.
  const boardPalette = resolvePalette(business.menu_template_id);
  const palette: MenuPalette = business.menu_palette_id
    ? (COLOR_PALETTES_BY_SLUG[business.menu_palette_id] ?? boardPalette)
    : boardPalette;
  // These templates render their own header with the business name (in their
  // palette), so the generic dark BusinessHeader is suppressed to avoid a
  // duplicate. Only classic (and bottom-nav / any unported slug → Classic) keeps it.
  const showBusinessHeader = ![
    "left-drawer", "icon-rail", "sticky-tabs", "category-sidebar", "store-sections",
    "infinite-feed", "magazine", "streaming-rows", "timeline", "carousel", "stories",
    "card-stack", "gesture", "ai-personalized", "luxury", "fullscreen-type",
    "glass-chips", "immersive", "masonry-search",
  ].includes(business.menu_template_id);

  // ── Hover state for card effects (lifted here for tilt/spotlight mouse tracking)
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ mx: 0.5, my: 0.5 });

  const handleCardEnter = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, id: string) => {
      const r = e.currentTarget.getBoundingClientRect();
      setMousePos({
        mx: (e.clientX - r.left) / r.width,
        my: (e.clientY - r.top) / r.height,
      });
      setHoveredCardId(id);
    },
    []
  );

  const handleCardLeave = useCallback(() => {
    setHoveredCardId(null);
  }, []);

  const handleCardMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, id: string) => {
      if (hoveredCardId === id) {
        const r = e.currentTarget.getBoundingClientRect();
        setMousePos({
          mx: (e.clientX - r.left) / r.width,
          my: (e.clientY - r.top) / r.height,
        });
      }
    },
    [hoveredCardId]
  );

  // ── Cart state ──────────────────────────────────────────────────────────────
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [customizerItem, setCustomizerItem] = useState<PublicMenuItem | null>(null);
  const [step, setStep] = useState<AppStep>("menu");
  const [pickupType, setPickupType] = useState<PickupType>("counter");
  const [pickupTable, setPickupTable] = useState("");
  const [pickupName, setPickupName] = useState("");
  // Nombre del perfil del usuario con sesión, para pre-llenar la casilla de B1.
  // Vacío para invitados. Se resuelve perezosamente (solo cuando el usuario
  // muestra intención de compra), para no pedir la sesión a quien solo mira el menú.
  const [profileName, setProfileName] = useState("");

  // ── Table QR context (C2) — written by B5's /t/[token] into sessionStorage ──
  // Only honoured when its businessSlug matches THIS page's business (never carry
  // one venue's table to another). When present, the order is tagged to the real
  // table via its token (resolved server-side in the payments EF).
  const [tableCtx, setTableCtx] = useState<{ token: string; tableLabel: string } | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(TABLE_CONTEXT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { token?: string; tableLabel?: string; businessSlug?: string };
      if (parsed.businessSlug === business.slug && typeof parsed.token === "string" && parsed.token) {
        setTableCtx({ token: parsed.token, tableLabel: parsed.tableLabel ?? "" });
        // Reflect the table in the pickup flow (order_type='table', real label).
        setPickupType("table");
        setPickupTable(parsed.tableLabel ?? "");
      } else if (parsed.businessSlug && parsed.businessSlug !== business.slug) {
        // Navigated to a different venue — drop the stale table context.
        sessionStorage.removeItem(TABLE_CONTEXT_KEY);
      }
    } catch {
      // Malformed/unavailable sessionStorage — ignore.
    }
  }, [business.slug]);

  function clearTableContext() {
    setTableCtx(null);
    try {
      sessionStorage.removeItem(TABLE_CONTEXT_KEY);
    } catch {
      /* ignore */
    }
  }

  // Resolver el nombre del perfil UNA sola vez, cuando el usuario sale del menú
  // (abre el carrito) — no en cada carga de menú. Invitado sin sesión → se queda
  // vacío. NOTA: esta resolución es temporal aquí; B2b consolidará de dónde sale
  // el nombre. No es dato de dinero, así que la duplicación breve es aceptable.
  const profileFetchedRef = useRef(false);
  useEffect(() => {
    if (step === "menu") return;
    if (profileFetchedRef.current) return;
    profileFetchedRef.current = true;
    void (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user) return; // invitado → casilla vacía
        const { data: prof } = await supabase
          .from("public_profiles")
          .select("display_name, username")
          .eq("id", data.user.id)
          .maybeSingle();
        const row = prof as { display_name: string | null; username: string | null } | null;
        const n = (row?.display_name ?? row?.username ?? "").trim();
        if (n) setProfileName(n.slice(0, 60));
      } catch {
        /* si falla, la casilla queda vacía — no bloquea nada */
      }
    })();
  }, [step]);

  // ── Category nav active tracking ────────────────────────────────────────────
  const [activeCategory, setActiveCategory] = useState<string>(
    categories[0]?.id ?? ""
  );
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());

  useEffect(() => {
    if (categories.length === 0) return;

    const observers: IntersectionObserver[] = [];
    const NAV_HEIGHT = 56;

    categories.forEach((cat) => {
      const el = sectionRefs.current.get(cat.id);
      if (!el) return;

      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveCategory(cat.id);
        },
        { rootMargin: `-${NAV_HEIGHT}px 0px -60% 0px`, threshold: 0 }
      );
      obs.observe(el);
      observers.push(obs);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, [categories]);

  const scrollToCategory = useCallback((catId: string) => {
    setActiveCategory(catId);
    document.getElementById(`cat-${catId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  // ── Cart handlers ───────────────────────────────────────────────────────────
  const addToCart = useCallback(
    (
      item: PublicMenuItem,
      size: MenuItemOption | null,
      extras: MenuItemOption[],
      qty: number,
      groupSelections: GroupSelection[] = [],
      notes?: string
    ) => {
      const lineTotalCents =
        groupSelections.length > 0
          ? calcLineFromGroups(item.price_cents, groupSelections, qty)
          : calcLine(item.price_cents, size, extras, qty);
      setCartItems((prev) => [
        ...prev,
        {
          cartId: `${item.id}-${Date.now()}`,
          itemId: item.id,
          name: item.name,
          basePriceCents: item.price_cents,
          quantity: qty,
          selectedSize: size,
          selectedExtras: extras,
          groupSelections,
          lineTotalCents,
          notes: notes?.trim() || undefined,
        },
      ]);
      setCustomizerItem(null);
    },
    []
  );

  const updateQty = useCallback((cartId: string, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((ci) => {
          if (ci.cartId !== cartId) return ci;
          const newQty = ci.quantity + delta;
          if (newQty <= 0) return null;
          const lineTotalCents =
            ci.groupSelections.length > 0
              ? calcLineFromGroups(ci.basePriceCents, ci.groupSelections, newQty)
              : calcLine(ci.basePriceCents, ci.selectedSize, ci.selectedExtras, newQty);
          return { ...ci, quantity: newQty, lineTotalCents };
        })
        .filter(Boolean) as CartItem[]
    );
  }, []);

  const removeFromCart = useCallback((cartId: string) => {
    setCartItems((prev) => prev.filter((ci) => ci.cartId !== cartId));
  }, []);

  const handleItemAdd = useCallback(
    (item: PublicMenuItem) => {
      if (item.groups.length > 0) {
        setCustomizerItem(item);
      } else {
        addToCart(item, null, [], 1);
      }
    },
    [addToCart]
  );

  const cartCount = cartItems.reduce((s, i) => s + i.quantity, 0);
  const cartTotal = cartItems.reduce((s, i) => s + i.lineTotalCents, 0);

  return (
    // Responsive shell: on desktop the menu is a centered ~480px "app column"
    // with the palette bg extending to the sides; on mobile it's full width.
    // The inner shell has a `transform`, which makes every position:fixed float
    // inside the templates (carts, FABs, drawers, sheet backdrops) anchor to the
    // column instead of the window — and since the shell is its own 100dvh
    // scroll container, those floats stay pinned to the column's bottom while the
    // content scrolls. No per-template positioning changes needed.
    <div
      style={{
        background: palette.bg,
        minHeight: "100dvh",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <main
        data-theme="dark"
        style={{
          width: "100%",
          maxWidth: 480,
          height: "100dvh",
          overflowY: "auto",
          overflowX: "hidden",
          position: "relative",
          transform: "translateZ(0)",
          WebkitOverflowScrolling: "touch",
          background: palette.bg,
          color: "var(--text-primary)",
          paddingBottom: 16,
        }}
      >
      {tableCtx && (
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "10px 14px",
            background: palette.accent,
            color: palette.accentText,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <span>
            Estás pidiendo en la mesa{tableCtx.tableLabel ? ` ${tableCtx.tableLabel}` : ""}
          </span>
          <button
            type="button"
            onClick={clearTableContext}
            style={{
              background: "transparent",
              border: `1px solid ${palette.accentText}`,
              color: palette.accentText,
              borderRadius: 999,
              padding: "3px 10px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            No estoy en esa mesa
          </button>
        </div>
      )}

      {showBusinessHeader && <BusinessHeader biz={business} />}

      <MenuPaletteContext.Provider value={palette}>
      <MenuTemplateRenderer
        templateId={business.menu_template_id}
        business={business}
        categories={categories}
        activeCategory={activeCategory}
        scrollToCategory={scrollToCategory}
        sectionRefs={sectionRefs}
        onItemAdd={handleItemAdd}
        cartCount={cartCount}
        cartTotal={cartTotal}
        onOpenCart={() => setStep("cart")}
        cardEffect={cardEffect}
        hoveredCardId={hoveredCardId}
        mousePos={mousePos}
        onCardEnter={handleCardEnter}
        onCardLeave={handleCardLeave}
        onCardMove={handleCardMove}
      />
      </MenuPaletteContext.Provider>

      {/* Templates that render their own docked cart bar suppress the shared FAB. */}
      {!["icon-rail", "sticky-tabs", "category-sidebar", "store-sections", "glass-chips", "infinite-feed", "magazine", "streaming-rows", "masonry-search", "fullscreen-type", "timeline", "luxury", "carousel", "immersive", "stories", "card-stack", "gesture", "ai-personalized"].includes(business.menu_template_id) && (
        <CartFAB count={cartCount} total={cartTotal} onClick={() => setStep("cart")} />
      )}

      {customizerItem && (
        <CustomizerSheet
          palette={palette}
          item={customizerItem}
          onClose={() => setCustomizerItem(null)}
          onAddToCart={addToCart}
        />
      )}

      {step === "cart" && (
        <CartSheet
          palette={palette}
          cartItems={cartItems}
          onClose={() => setStep("menu")}
          onUpdateQty={updateQty}
          onRemove={removeFromCart}
          onContinue={() => setStep("pickup")}
        />
      )}

      {step === "pickup" && (
        <PickupSheet
          palette={palette}
          cartItems={cartItems}
          initialTableNumber={tableCtx ? tableCtx.tableLabel : pickupTable}
          initialName={profileName}
          onBack={() => setStep("cart")}
          onConfirm={(type, table, name) => {
            setPickupType(type);
            setPickupTable(table);
            setPickupName(name);
            setStep("pay");
          }}
        />
      )}

      {step === "pay" && (
        <CheckoutStep
          business={{ id: business.id, name: business.name }}
          cartItems={cartItems}
          pickupType={tableCtx ? "table" : pickupType}
          tableLabel={tableCtx ? tableCtx.tableLabel : pickupTable}
          tableQrToken={tableCtx?.token ?? null}
          onBack={() => setStep("pickup")}
          onDone={() => {
            setCartItems([]);
            setStep("menu");
          }}
        />
      )}
      </main>
    </div>
  );
}
