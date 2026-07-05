"use client";

import { useState } from "react";
import type { MenuTemplateProps } from "./types";
import { EmptyMenu } from "./shared/EmptyMenu";
import { fmtPrice } from "./shared/format";
import { MENU_PALETTES } from "./shared/palettes";

/**
 * CardStack (#17 Card Stack Navigation). The food truck's whole menu as a deck:
 * one decision at a time — pass or add. No categories, no lists. A deck-progress
 * bar tracks how far you are. Ported from the Menu Systems Board #17 mock, themed
 * with public-menu tokens.
 *
 * Web adaptation: tap the round buttons (no real swipe gestures) to pass / add /
 * save, each advancing the deck. MenuPageClient suppresses the shared CartFAB —
 * the header "◇ N" and the buttons are the affordances.
 */
const P = MENU_PALETTES["card-stack"]!;

export default function CardStack({
  business,
  categories,
  onItemAdd,
  cartCount,
  onOpenCart,
}: MenuTemplateProps) {
  const items = categories.flatMap((c) => c.items);
  const [index, setIndex] = useState(0);

  if (items.length === 0) {
    return <EmptyMenu bizName={business.name} />;
  }

  const done = index >= items.length;
  const advance = () => setIndex((i) => i + 1);
  const add = () => {
    const it = items[index];
    if (it && !(it.stock_count !== null && it.stock_count === 0)) onItemAdd(it);
    advance();
  };

  return (
    <div style={{ background: P.bg, minHeight: "100vh", maxWidth: 680, margin: "0 auto", padding: "14px 16px 24px" }}>
      {/* Header + progress */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: P.text, margin: 0, letterSpacing: "-0.3px" }}>{business.name}</h1>
        <button
          type="button"
          onClick={onOpenCart}
          aria-label={`Ver carrito, ${cartCount} artículos`}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 999, border: `1px solid ${P.border}`, background: P.surfaceElevated, color: P.text, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}
        >
          ◇ {cartCount}
        </button>
      </div>
      <div style={{ marginTop: 12, height: 4, borderRadius: 999, background: P.surfaceElevated, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: "100%",
            background: P.accent,
            transformOrigin: "left",
            transform: `scaleX(${Math.min(index, items.length) / items.length})`,
            transition: "transform 0.25s",
          }}
        />
      </div>
      <div style={{ fontSize: 11, color: P.textFaint, marginTop: 6, textAlign: "center" }}>
        {done ? `${items.length}/${items.length}` : `${index + 1}/${items.length}`}
      </div>

      {done ? (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🎉</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: P.text }}>¡Los viste todos!</div>
          <div style={{ fontSize: 13, color: P.textMuted, marginTop: 6 }}>
            {cartCount > 0 ? `Tienes ${cartCount} en tu carrito.` : "No agregaste nada aún."}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 20 }}>
            <button type="button" onClick={() => setIndex(0)} style={{ padding: "11px 20px", borderRadius: 999, border: `1px solid ${P.border}`, background: "transparent", color: P.text, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              ↺ Reiniciar
            </button>
            {cartCount > 0 && (
              <button type="button" onClick={onOpenCart} style={{ padding: "11px 20px", borderRadius: 999, border: "none", background: P.accent, color: P.accentText, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                Ver carrito →
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Card deck */}
          <div style={{ position: "relative", height: 440, marginTop: 18 }}>
            {items
              .slice(index, index + 3)
              .map((item, i) => {
                const depth = i; // 0 = front
                const soldOut = item.stock_count !== null && item.stock_count === 0;
                return (
                  <div
                    key={item.id}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: "50%",
                      width: 300,
                      maxWidth: "88%",
                      height: 420,
                      transform: `translateX(-50%) translateY(${depth * 10}px) scale(${1 - depth * 0.05}) rotate(${depth === 0 ? 0 : depth * 4}deg)`,
                      transformOrigin: "center top",
                      opacity: depth === 0 ? 1 : 0.6 - depth * 0.15,
                      zIndex: 30 - depth,
                      background: P.surfaceElevated,
                      border: `1px solid ${P.border}`,
                      borderRadius: 24,
                      overflow: "hidden",
                      boxShadow: depth === 0 ? "0 20px 44px rgba(0,0,0,0.45)" : "none",
                      pointerEvents: depth === 0 ? "auto" : "none",
                    }}
                  >
                    <div style={{ position: "relative", height: 260 }}>
                      {item.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.photo_url} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      ) : (
                        <div style={{ width: "100%", height: "100%", background: P.surface, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 46 }}>🍽️</div>
                      )}
                    </div>
                    <div style={{ padding: "14px 16px" }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: P.text }}>{item.name}</div>
                      {item.description && (
                        <div style={{ fontSize: 12.5, color: P.textMuted, marginTop: 6, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                          {item.description}
                        </div>
                      )}
                      <div style={{ fontSize: 20, fontWeight: 800, color: P.price, marginTop: 10 }}>
                        {soldOut ? "Agotado" : fmtPrice(item.price_cents)}
                      </div>
                    </div>
                  </div>
                );
              })
              .reverse()}
          </div>

          {/* Decision buttons */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", gap: 28, marginTop: 26 }}>
            <DeckButton onClick={advance} label="PASAR" glyph="✕" color={P.textMuted} border={P.border} />
            <DeckButton onClick={add} label="AGREGAR" glyph="+" color="#fff" bg={P.accent} border={P.accent} big />
            <DeckButton onClick={advance} label="GUARDAR" glyph="♡" color={P.price} border={P.price} />
          </div>
        </>
      )}
    </div>
  );
}

function DeckButton({
  onClick,
  label,
  glyph,
  color,
  bg = "transparent",
  border,
  big = false,
}: {
  onClick: () => void;
  label: string;
  glyph: string;
  color: string;
  bg?: string;
  border: string;
  big?: boolean;
}) {
  const size = big ? 68 : 54;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          border: `1.5px solid ${border}`,
          background: bg,
          color,
          fontSize: big ? 30 : 22,
          lineHeight: 1,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {glyph}
      </button>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1px", color: P.textFaint }}>{label}</span>
    </div>
  );
}
