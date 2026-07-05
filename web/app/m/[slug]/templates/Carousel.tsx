"use client";

import { useState, useRef } from "react";
import type { MenuTemplateProps } from "./types";
import { EmptyMenu } from "./shared/EmptyMenu";
import { fmtPrice } from "./shared/format";
import { MENU_PALETTES } from "./shared/palettes";

/**
 * Carousel (#09 Horizontal Product Carousel). One product at a time, sideways: a
 * CSS scroll-snap carousel with peeking neighbors, like flipping through a
 * jukebox. A segmented control switches category. Ported from the Menu Systems
 * Board #09 mock, themed with public-menu tokens.
 *
 * Note: MenuPageClient suppresses the shared CartFAB — the header "◇ N" bubble
 * is this template's cart affordance.
 */
const P = MENU_PALETTES["carousel"]!;

export default function Carousel({
  business,
  categories,
  onItemAdd,
  cartCount,
  onOpenCart,
}: MenuTemplateProps) {
  const nonEmpty = categories.filter((c) => c.items.length > 0);
  const [activeCat, setActiveCat] = useState<string>(nonEmpty[0]?.id ?? "");
  const [scrollIndex, setScrollIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  if (nonEmpty.length === 0) {
    return <EmptyMenu bizName={business.name} />;
  }

  const cat = nonEmpty.find((c) => c.id === activeCat) ?? nonEmpty[0];
  const items = cat.items;

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const step = el.scrollWidth / items.length;
    if (step > 0) setScrollIndex(Math.round(el.scrollLeft / step));
  };

  const selectCat = (id: string) => {
    setActiveCat(id);
    setScrollIndex(0);
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  };

  return (
    <div style={{ background: P.bg, minHeight: "100vh", maxWidth: 680, margin: "0 auto", paddingBottom: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "14px 20px 4px" }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: P.text, margin: 0, letterSpacing: "-0.4px" }}>
            {business.name}
          </h1>
          <div style={{ fontSize: 12.5, color: P.textMuted, marginTop: 3 }}>Elige tu antojo</div>
        </div>
        <button
          type="button"
          onClick={onOpenCart}
          aria-label={`Ver carrito, ${cartCount} artículos`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 14px",
            borderRadius: 999,
            border: `1px solid ${P.border}`,
            background: P.surfaceElevated,
            color: P.text,
            fontSize: 12.5,
            fontWeight: 700,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          ◇ {cartCount}
        </button>
      </div>

      {/* Segmented control */}
      <div style={{ margin: "14px 20px 0", display: "flex", gap: 4, background: P.surfaceElevated, border: `1px solid ${P.border}`, borderRadius: 999, padding: 4, overflowX: "auto", scrollbarWidth: "none" }}>
        {nonEmpty.map((c) => {
          const on = c.id === cat.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => selectCat(c.id)}
              style={{
                flexShrink: 0,
                padding: "7px 16px",
                borderRadius: 999,
                border: "none",
                cursor: "pointer",
                background: on ? P.accent : "transparent",
                color: on ? P.accentText : P.textMuted,
                fontSize: 13,
                fontWeight: on ? 700 : 500,
                whiteSpace: "nowrap",
              }}
            >
              {c.name}
            </button>
          );
        })}
      </div>

      {/* Snap carousel */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        style={{
          display: "flex",
          gap: 14,
          overflowX: "auto",
          scrollSnapType: "x mandatory",
          scrollbarWidth: "none",
          padding: "18px 9% 6px",
          marginTop: 4,
        }}
      >
        {items.map((item) => {
          const soldOut = item.stock_count !== null && item.stock_count === 0;
          return (
            <div
              key={item.id}
              style={{
                flex: "0 0 82%",
                maxWidth: 340,
                scrollSnapAlign: "center",
                background: P.surfaceElevated,
                border: `1px solid ${P.border}`,
                borderRadius: 24,
                padding: 14,
                display: "flex",
                flexDirection: "column",
                boxShadow: "0 18px 40px rgba(0,0,0,0.35)",
              }}
            >
              {item.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.photo_url} alt={item.name} style={{ width: "100%", height: 220, objectFit: "cover", borderRadius: 16, display: "block" }} />
              ) : (
                <div style={{ width: "100%", height: 220, borderRadius: 16, background: P.surface, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44 }}>🍽️</div>
              )}
              <div style={{ fontSize: 18, fontWeight: 800, color: P.text, marginTop: 14 }}>{item.name}</div>
              {item.description && (
                <div style={{ fontSize: 13, color: P.textMuted, marginTop: 6, lineHeight: 1.5, minHeight: 38 }}>{item.description}</div>
              )}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 14 }}>
                <span style={{ fontSize: 20, fontWeight: 800, color: P.price }}>
                  {soldOut ? "Agotado" : fmtPrice(item.price_cents)}
                </span>
                <button
                  type="button"
                  onClick={() => !soldOut && onItemAdd(item)}
                  disabled={soldOut}
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 16,
                    border: "none",
                    background: soldOut ? P.surface : P.accent,
                    color: "#fff",
                    fontSize: 24,
                    fontWeight: 700,
                    lineHeight: 1,
                    cursor: soldOut ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Dots + hint */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginTop: 12 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {items.map((it, i) => (
            <span
              key={it.id}
              style={{
                width: i === scrollIndex ? 18 : 6,
                height: 6,
                borderRadius: 999,
                background: i === scrollIndex ? P.accent : P.border,
                transition: "background 0.2s",
              }}
            />
          ))}
        </div>
        <div style={{ fontSize: 11, color: P.textFaint }}>← Desliza para ver los {items.length} →</div>
      </div>
    </div>
  );
}
