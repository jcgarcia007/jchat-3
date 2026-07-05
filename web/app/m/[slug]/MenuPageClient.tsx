"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { fmtPrice } from "./templates/shared/format";
import MenuTemplateRenderer from "./templates/MenuTemplateRenderer";
import type {
  PublicBusiness,
  PublicMenuCategory,
  PublicMenuItem,
  MenuItemOption,
  ModifierGroup,
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

type AppStep = "menu" | "cart" | "pickup" | "success";
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
  item,
  onClose,
  onAddToCart,
}: {
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
    border: "1.5px solid var(--border-subtle)",
    background: "var(--bg-surface)",
    color: "var(--text-primary)",
    fontSize: 14,
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box",
  };

  return (
    <Backdrop onClose={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-elevated)",
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
                    "linear-gradient(135deg, var(--color-brand) 0%, var(--color-brand-purple) 100%)",
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
                color: "#fff",
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
                background: "var(--bg-elevated)",
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
                      ? "2.5px solid var(--color-gold)"
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
                color: "var(--text-primary)",
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
                color: "var(--color-gold)",
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
                color: "var(--text-secondary)",
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
                    color: "var(--text-secondary)",
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
                    <span style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
                      · hasta {group.max_select}
                    </span>
                  )}
                  {group.type === "multi" && group.min_select > 0 && (
                    <span style={{ fontSize: 11, color: "var(--color-danger)", textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>
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
                              ? "2px solid var(--color-gold)"
                              : "1.5px solid var(--border-subtle)",
                            background: active
                              ? "rgba(217,119,6,0.12)"
                              : "var(--bg-surface)",
                            color: active ? "var(--color-gold)" : "var(--text-primary)",
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
                            <span style={{ fontSize: 11, color: active ? "var(--color-gold)" : "var(--text-secondary)", fontWeight: 500 }}>
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
                            background: active ? "rgba(217,119,6,0.07)" : "transparent",
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
                              border: active ? "none" : "2px solid var(--border-subtle)",
                              background: active ? "var(--color-gold)" : "transparent",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                              transition: "background .15s",
                            }}
                          >
                            {active && <span style={{ color: "#fff", fontSize: 13, lineHeight: 1, fontWeight: 700 }}>✓</span>}
                          </span>
                          <span style={{ flex: 1, fontSize: 14, color: "var(--text-primary)", fontWeight: active ? 500 : 400 }}>
                            {choice.label}
                          </span>
                          {choice.price_cents > 0 && (
                            <span style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500, paddingRight: 4 }}>
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
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
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
            background: "var(--bg-elevated)",
            borderTop: "1px solid var(--border-subtle)",
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
              border: "1.5px solid var(--border-subtle)",
              flexShrink: 0,
            }}
          >
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              style={{
                width: 38,
                height: 42,
                border: "none",
                background: "var(--bg-surface)",
                color: "var(--text-primary)",
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
                color: "var(--text-primary)",
                background: "var(--bg-elevated)",
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
                background: "var(--bg-surface)",
                color: "var(--text-primary)",
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
              background: "linear-gradient(135deg, var(--color-brand) 0%, var(--color-brand-purple) 100%)",
              color: "#fff",
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
  cartItems,
  onClose,
  onUpdateQty,
  onRemove,
  onContinue,
}: {
  cartItems: CartItem[];
  onClose: () => void;
  onUpdateQty: (cartId: string, delta: number) => void;
  onRemove: (cartId: string) => void;
  onContinue: () => void;
}) {
  const subtotal = cartItems.reduce((s, i) => s + i.lineTotalCents, 0);

  return (
    <Backdrop onClose={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-elevated)",
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
            borderBottom: "1px solid var(--border-subtle)",
            flexShrink: 0,
          }}
        >
          <h2
            style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}
          >
            🛒 Tu carrito
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-tertiary)",
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
                color: "var(--text-tertiary)",
                fontSize: 14,
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 8 }}>🛒</div>
              Tu carrito está vacío
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {cartItems.map((ci) => (
                <div
                  key={ci.cartId}
                  style={{
                    background: "var(--bg-surface)",
                    borderRadius: 12,
                    padding: "12px 14px",
                    border: "1px solid var(--border-subtle)",
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
                        color: "var(--text-primary)",
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
                        color: "var(--color-danger)",
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
                        color: "var(--text-tertiary)",
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
                        color: "var(--text-tertiary)",
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
                        style={smallQtyBtnStyle}
                      >
                        −
                      </button>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: "var(--text-primary)",
                          minWidth: 20,
                          textAlign: "center",
                        }}
                      >
                        {ci.quantity}
                      </span>
                      <button
                        onClick={() => onUpdateQty(ci.cartId, 1)}
                        style={smallQtyBtnStyle}
                      >
                        +
                      </button>
                    </div>
                    <span
                      style={{ fontSize: 14, fontWeight: 700, color: "var(--color-gold)" }}
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
            borderTop: "1px solid var(--border-subtle)",
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
            <span style={{ fontSize: 14, color: "var(--text-secondary)", fontWeight: 500 }}>
              Subtotal
            </span>
            <span style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>
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
                  ? "linear-gradient(135deg, var(--color-brand) 0%, var(--color-brand-purple) 100%)"
                  : "var(--bg-surface)",
              color: cartItems.length > 0 ? "#fff" : "var(--text-tertiary)",
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
  cartItems,
  onBack,
  onConfirm,
}: {
  cartItems: CartItem[];
  onBack: () => void;
  onConfirm: (type: PickupType, tableNumber: string) => void;
}) {
  const [pickupType, setPickupType] = useState<PickupType>("counter");
  const [tableNumber, setTableNumber] = useState("");
  const subtotal = cartItems.reduce((s, i) => s + i.lineTotalCents, 0);
  const canConfirm = pickupType === "counter" || tableNumber.trim().length > 0;

  return (
    <Backdrop onClose={onBack}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-elevated)",
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
            borderBottom: "1px solid var(--border-subtle)",
            flexShrink: 0,
          }}
        >
          <button
            onClick={onBack}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-secondary)",
              cursor: "pointer",
              fontSize: 20,
              padding: 0,
              lineHeight: 1,
            }}
          >
            ←
          </button>
          <h2
            style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}
          >
            ¿Cómo quieres recibir tu pedido?
          </h2>
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            {(
              [
                {
                  type: "counter" as PickupType,
                  label: "🍽️ En la barra",
                  desc: "Recoge en el counter cuando esté listo",
                },
                {
                  type: "table" as PickupType,
                  label: "🪑 En mi mesa",
                  desc: "Te lo llevamos a tu mesa",
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
                      ? "2px solid var(--color-brand)"
                      : "1px solid var(--border-subtle)",
                    background: active ? "rgba(79,70,229,0.1)" : "var(--bg-surface)",
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%",
                  }}
                >
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: active ? "var(--color-brand)" : "var(--text-primary)",
                      marginBottom: 3,
                    }}
                  >
                    {label}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{desc}</div>
                </button>
              );
            })}
          </div>

          {pickupType === "table" && (
            <div style={{ marginBottom: 20 }}>
              <label
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-secondary)",
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
                  border: "1px solid var(--border-subtle)",
                  background: "var(--bg-surface)",
                  color: "var(--text-primary)",
                  fontSize: 15,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
          )}

          <div
            style={{
              background: "var(--bg-surface)",
              borderRadius: 14,
              padding: "14px 16px",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-tertiary)",
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
                  <span style={{ fontSize: 13, color: "var(--text-secondary)", flex: 1 }}>
                    {ci.quantity}× {ci.name}
                    {ci.groupSelections.length > 0
                      ? ` (${ci.groupSelections.flatMap((gs) => gs.choices.map((c) => c.label)).join(", ")})`
                      : ci.selectedSize
                      ? ` (${ci.selectedSize.label})`
                      : ""}
                  </span>
                  <span
                    style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", flexShrink: 0 }}
                  >
                    {fmtPrice(ci.lineTotalCents)}
                  </span>
                </div>
              ))}
            </div>
            <div
              style={{
                borderTop: "1px solid var(--border-subtle)",
                marginTop: 10,
                paddingTop: 10,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                Total
              </span>
              <span style={{ fontSize: 16, fontWeight: 700, color: "var(--color-gold)" }}>
                {fmtPrice(subtotal)}
              </span>
            </div>
          </div>
        </div>

        <div
          style={{
            padding: "12px 16px 24px",
            borderTop: "1px solid var(--border-subtle)",
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => canConfirm && onConfirm(pickupType, tableNumber.trim())}
            disabled={!canConfirm}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: 14,
              border: "none",
              background: canConfirm
                ? "linear-gradient(135deg, #059669 0%, #0d9488 100%)"
                : "var(--bg-surface)",
              color: canConfirm ? "#fff" : "var(--text-tertiary)",
              fontSize: 15,
              fontWeight: 700,
              cursor: canConfirm ? "pointer" : "not-allowed",
            }}
          >
            Confirmar pedido (demo)
          </button>
          {pickupType === "table" && !tableNumber.trim() && (
            <p
              style={{
                fontSize: 11,
                color: "var(--color-danger)",
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

// ── Success Sheet ─────────────────────────────────────────────────────────────

function SuccessSheet({
  pickupType,
  tableNumber,
  onDone,
}: {
  pickupType: PickupType;
  tableNumber: string;
  onDone: () => void;
}) {
  return (
    <Backdrop onClose={onDone}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-elevated)",
          borderRadius: "20px 20px 0 0",
          padding: "32px 24px 40px",
          textAlign: "center",
          width: "100%",
          maxWidth: 460,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
        <h2
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "var(--text-primary)",
            margin: "0 0 10px",
          }}
        >
          ¡Pedido recibido!
        </h2>
        <p
          style={{
            fontSize: 14,
            color: "var(--text-secondary)",
            lineHeight: 1.6,
            margin: "0 0 8px",
          }}
        >
          {pickupType === "counter"
            ? "Recoge tu pedido en la barra cuando esté listo."
            : `Te lo llevamos a la mesa ${tableNumber}.`}
        </p>
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "0 0 28px" }}>
          Pago próximamente — esto es una demo del flujo.
        </p>
        <button
          onClick={onDone}
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: 14,
            border: "none",
            background:
              "linear-gradient(135deg, var(--color-brand) 0%, var(--color-brand-purple) 100%)",
            color: "#fff",
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Seguir viendo el menú
        </button>
      </div>
    </Backdrop>
  );
}

// ── Backdrop ──────────────────────────────────────────────────────────────────

function Backdrop({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        alignItems: "center",
      }}
    >
      {children}
    </div>
  );
}

// ── Shared button styles ──────────────────────────────────────────────────────

const qtyBtnStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: "50%",
  border: "1px solid var(--border-subtle)",
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
  fontSize: 20,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 700,
  lineHeight: 1,
};

const smallQtyBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: "50%",
  border: "1px solid var(--border-subtle)",
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
  fontSize: 16,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 700,
  lineHeight: 1,
};

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
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
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
    <main
      data-theme="dark"
      style={{
        background: "var(--bg-base)",
        minHeight: "100vh",
        color: "var(--text-primary)",
        paddingBottom: cartCount > 0 ? 96 : 32,
      }}
    >
      <BusinessHeader biz={business} />

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

      {/* Templates that render their own docked cart bar suppress the shared FAB. */}
      {!["icon-rail", "sticky-tabs", "category-sidebar", "store-sections", "glass-chips", "infinite-feed", "magazine", "streaming-rows", "masonry-search", "fullscreen-type", "timeline", "luxury", "carousel", "immersive", "stories", "card-stack", "gesture", "ai-personalized"].includes(business.menu_template_id) && (
        <CartFAB count={cartCount} total={cartTotal} onClick={() => setStep("cart")} />
      )}

      {customizerItem && (
        <CustomizerSheet
          item={customizerItem}
          onClose={() => setCustomizerItem(null)}
          onAddToCart={addToCart}
        />
      )}

      {step === "cart" && (
        <CartSheet
          cartItems={cartItems}
          onClose={() => setStep("menu")}
          onUpdateQty={updateQty}
          onRemove={removeFromCart}
          onContinue={() => setStep("pickup")}
        />
      )}

      {step === "pickup" && (
        <PickupSheet
          cartItems={cartItems}
          onBack={() => setStep("cart")}
          onConfirm={(type, table) => {
            setPickupType(type);
            setPickupTable(table);
            setStep("success");
          }}
        />
      )}

      {step === "success" && (
        <SuccessSheet
          pickupType={pickupType}
          tableNumber={pickupTable}
          onDone={() => {
            setCartItems([]);
            setStep("menu");
          }}
        />
      )}
    </main>
  );
}
