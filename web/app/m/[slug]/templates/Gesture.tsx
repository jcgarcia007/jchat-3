"use client";
import { IconShoppingCart } from "@tabler/icons-react";

import { useState } from "react";
import type { MenuTemplateProps } from "./types";
import { EmptyMenu } from "./shared/EmptyMenu";
import { fmtPrice } from "./shared/format";
import { useMenuPalette } from "./shared/paletteContext";

/**
 * Gesture (#16 Gesture-Based Navigation). Almost no chrome: one dish on stage at
 * a time. On mobile, horizontal swipes change category, vertical swipes change
 * dish, and a long-press commits the add; edge whispers teach the grammar.
 * Ported from the Menu Systems Board #16 mock, themed with public-menu tokens.
 *
 * Web adaptation: the gestures become tap zones / arrows and a normal tap adds
 * (no long-press). MenuPageClient suppresses the shared CartFAB — the header
 * the header cart-icon pill and the central button are the affordances.
 */

export default function Gesture({
  business,
  categories,
  onItemAdd,
  cartCount,
  onOpenCart,
}: MenuTemplateProps) {
  const P = useMenuPalette();
  const stepBtn: React.CSSProperties = {
    width: 40,
    height: 40,
    borderRadius: "50%",
    border: `1px solid ${P.border}`,
    background: P.surfaceElevated,
    color: P.textMuted,
    fontSize: 18,
    lineHeight: 1,
    cursor: "pointer",
  };
  const nonEmpty = categories.filter((c) => c.items.length > 0);
  const [catIdx, setCatIdx] = useState(0);
  const [itemIdx, setItemIdx] = useState(0);

  if (nonEmpty.length === 0) {
    return <EmptyMenu bizName={business.name} />;
  }

  const cat = nonEmpty[Math.min(catIdx, nonEmpty.length - 1)];
  const items = cat.items;
  const item = items[Math.min(itemIdx, items.length - 1)];
  const soldOut = item.stock_count !== null && item.stock_count === 0;

  const prevCat = () => {
    setCatIdx((c) => (c - 1 + nonEmpty.length) % nonEmpty.length);
    setItemIdx(0);
  };
  const nextCat = () => {
    setCatIdx((c) => (c + 1) % nonEmpty.length);
    setItemIdx(0);
  };
  const prevItem = () => setItemIdx((i) => (i - 1 + items.length) % items.length);
  const nextItem = () => setItemIdx((i) => (i + 1) % items.length);

  return (
    <div style={{ position: "relative", minHeight: "100vh", overflow: "hidden", display: "flex", flexDirection: "column", background: P.bg }}>
      {/* Minimal header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 20px 0" }}>
        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: "2px", textTransform: "uppercase", color: P.textFaint }}>{business.name}</span>
        <button
          type="button"
          onClick={onOpenCart}
          aria-label={`Ver carrito, ${cartCount} artículos`}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, border: `1px solid ${P.border}`, background: P.surfaceElevated, color: P.text, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
        >
          <IconShoppingCart size={15} style={{ verticalAlign: "-2px", marginRight: 3 }} />{cartCount}
        </button>
      </div>

      {/* Category indicator */}
      <div style={{ textAlign: "center", marginTop: 10, fontSize: 10, fontWeight: 900, letterSpacing: "3px", color: P.textFaint }}>
        {cat.name.toUpperCase()} — {items.length} {items.length === 1 ? "PLATO" : "PLATOS"}
      </div>

      {/* Edge whispers */}
      <div style={{ position: "absolute", left: 8, top: "48%", fontSize: 9, letterSpacing: "1px", color: P.textFaint, opacity: 0.5, writingMode: "vertical-rl", transform: "rotate(180deg)" }}>‹ categorías</div>
      <div style={{ position: "absolute", right: 8, top: "48%", fontSize: 9, letterSpacing: "1px", color: P.textFaint, opacity: 0.5, writingMode: "vertical-rl" }}>categorías ›</div>

      {/* Side category zones */}
      <button type="button" aria-label="Categoría anterior" onClick={prevCat} style={{ position: "absolute", left: 0, top: 90, bottom: 200, width: 44, background: "transparent", border: "none", cursor: "pointer", color: P.textFaint, fontSize: 24, zIndex: 5 }}>‹</button>
      <button type="button" aria-label="Categoría siguiente" onClick={nextCat} style={{ position: "absolute", right: 0, top: 90, bottom: 200, width: 44, background: "transparent", border: "none", cursor: "pointer", color: P.textFaint, fontSize: 24, zIndex: 5 }}>›</button>

      {/* Stage: one dish */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "16px 48px" }}>
        <button type="button" onClick={prevItem} aria-label="Plato anterior" style={stepBtn}>⌃</button>
        <div style={{ margin: "12px 0" }}>
          {item.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.photo_url} alt={item.name} style={{ width: 240, height: 240, borderRadius: "50%", objectFit: "cover", boxShadow: "0 30px 60px rgba(0,0,0,0.4)" }} />
          ) : (
            <div style={{ width: 240, height: 240, borderRadius: "50%", background: P.surface, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 56 }}>🍽️</div>
          )}
        </div>
        <button type="button" onClick={nextItem} aria-label="Plato siguiente" style={stepBtn}>⌄</button>

        <div style={{ fontSize: 24, fontWeight: 800, color: P.text, marginTop: 14 }}>{item.name}</div>
        {item.description && (
          <div style={{ fontSize: 13, color: P.textMuted, marginTop: 8, lineHeight: 1.5, maxWidth: 300 }}>{item.description}</div>
        )}
        <div style={{ fontSize: 22, fontWeight: 800, color: P.price, marginTop: 12 }}>
          {soldOut ? "Agotado" : fmtPrice(item.price_cents)}
        </div>
        <div style={{ fontSize: 9, letterSpacing: "1px", color: P.textFaint, opacity: 0.6, marginTop: 6 }}>⌃⌄ platos · ‹› categorías</div>
      </div>

      {/* Central add button */}
      <div style={{ padding: "0 24px 26px", display: "flex", justifyContent: "center" }}>
        <button
          type="button"
          onClick={() => !soldOut && onItemAdd(item)}
          disabled={soldOut}
          style={{
            width: "100%",
            maxWidth: 320,
            padding: "15px 20px",
            borderRadius: 999,
            border: `1.5px solid ${soldOut ? P.border : P.accent}`,
            background: soldOut ? "transparent" : P.accent,
            color: soldOut ? P.textFaint : P.accentText,
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: "1.5px",
            textTransform: "uppercase",
            cursor: soldOut ? "not-allowed" : "pointer",
          }}
        >
          {soldOut ? "Agotado" : "Mantén para agregar"}
        </button>
      </div>
    </div>
  );
}
