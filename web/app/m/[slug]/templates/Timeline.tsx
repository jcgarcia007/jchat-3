"use client";
import { IconShoppingCart } from "@tabler/icons-react";

import type { MenuTemplateProps } from "./types";
import { EmptyMenu } from "./shared/EmptyMenu";
import { fmtPrice } from "./shared/format";
import { useMenuPalette } from "./shared/paletteContext";

/**
 * Timeline (#14 Timeline Menu). The menu organized by time, not type: a tasting
 * evening plotted as a vertical itinerary of numbered nodes joined by a
 * connector line, each with a serving hour, while a running total tracks along
 * the top. Ported from the Menu Systems Board #14 mock, themed with public-menu
 * tokens.
 *
 * Note: linear (no scroll-spy; activeCategory/scrollToCategory unused).
 * MenuPageClient suppresses the shared CartFAB — the running-total bar is this
 * template's cart affordance.
 */

// Fake serving hours: start 7:00 PM, +20 min per stop.
function servingTime(index: number): string {
  const total = 19 * 60 + index * 20;
  const h = Math.floor(total / 60);
  const m = total % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}


export default function Timeline({
  business,
  categories,
  onItemAdd,
  cartCount,
  cartTotal,
  onOpenCart,
}: MenuTemplateProps) {
  const P = useMenuPalette();
  const items = categories.flatMap((c) => c.items);

  if (items.length === 0) {
    return <EmptyMenu bizName={business.name} />;
  }

  return (
    <div style={{ background: P.bg, minHeight: "100vh", maxWidth: 680, margin: "0 auto", padding: "12px 16px 32px" }}>
      {/* Header */}
      <div style={{ padding: "4px 2px 12px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: P.text, margin: 0, letterSpacing: "-0.4px" }}>
          {business.name}
        </h1>
        <div style={{ fontSize: 12.5, color: P.textMuted, marginTop: 3 }}>
          Velada de degustación · itinerario
        </div>
      </div>

      {/* Running total */}
      <button
        type="button"
        onClick={onOpenCart}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          gap: 12,
          padding: "12px 16px",
          borderRadius: 14,
          border: `1px solid ${P.border}`,
          background: P.surfaceElevated,
          cursor: "pointer",
          marginBottom: 18,
        }}
      >
        <span style={{ fontSize: 12.5, fontWeight: 700, color: P.text }}>
          <IconShoppingCart size={16} style={{ verticalAlign: "-3px", marginRight: 5 }} />Tu velada · {cartCount} {cartCount === 1 ? "platillo" : "platillos"}
        </span>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: P.accent }}>{fmtPrice(cartTotal)} →</span>
      </button>

      {/* Vertical itinerary */}
      <div>
        {items.map((item, i) => {
          const soldOut = item.stock_count !== null && item.stock_count === 0;
          const isLast = i === items.length - 1;
          return (
            <div key={item.id} style={{ display: "flex", gap: 14, alignItems: "stretch" }}>
              {/* Left rail: time + node + connector */}
              <div style={{ width: 58, flexShrink: 0, position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "1px", color: P.textFaint, marginBottom: 6, textAlign: "center" }}>
                  {servingTime(i)}
                </div>
                <div
                  style={{
                    position: "relative",
                    zIndex: 1,
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    background: P.bg,
                    border: `1.5px solid ${P.accent}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: 900,
                    color: P.accent,
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </div>
                {!isLast && (
                  <div
                    style={{
                      position: "absolute",
                      top: 34,
                      bottom: -18,
                      left: "50%",
                      transform: "translateX(-50%)",
                      width: 2,
                      background: P.border,
                    }}
                  />
                )}
              </div>

              {/* Right: dish card */}
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  gap: 12,
                  background: P.surfaceElevated,
                  border: `1px solid ${P.border}`,
                  borderRadius: 16,
                  padding: 10,
                  marginBottom: 18,
                }}
              >
                {item.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.photo_url} alt={item.name} style={{ width: 64, height: 64, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 64, height: 64, borderRadius: 10, background: P.surface, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>🍽️</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: P.text }}>{item.name}</div>
                  {item.description && (
                    <div style={{ fontSize: 11, color: P.textFaint, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.description}
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: P.accent }}>
                      {soldOut ? "Agotado" : fmtPrice(item.price_cents)}
                    </span>
                    <button
                      type="button"
                      onClick={() => !soldOut && onItemAdd(item)}
                      disabled={soldOut}
                      style={{
                        border: `1px solid ${P.accent}`,
                        background: "transparent",
                        color: P.accent,
                        borderRadius: 999,
                        padding: "5px 14px",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: soldOut ? "not-allowed" : "pointer",
                      }}
                    >
                      + Agregar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
