"use client";

import { useState } from "react";
import type { MenuTemplateProps } from "./types";
import { EmptyMenu } from "./shared/EmptyMenu";
import { fmtPrice } from "./shared/format";
import { MENU_PALETTES } from "./shared/palettes";

/**
 * Luxury (#20 Experimental Luxury). Anti-density as a statement: one numbered
 * chapter rail, one object on a black stage, hairline gold rules, and ordering
 * handed to a "concierge" orb. Built for a shop that sells a few things,
 * perfectly. Ported from the Menu Systems Board #20 mock, themed with
 * public-menu tokens.
 *
 * Note: MenuPageClient suppresses the shared CartFAB — the concierge orb is this
 * template's cart affordance.
 */

const SERIF = "var(--font-playfair), Georgia, 'Times New Roman', serif";
// MAISON OR palette — semantic colors from the single source.
const P = MENU_PALETTES.luxury!;
const GOLD = P.accent;

export default function Luxury({
  business,
  categories,
  onItemAdd,
  cartCount,
  onOpenCart,
}: MenuTemplateProps) {
  const items = categories.flatMap((c) => c.items);
  const [activeIndex, setActiveIndex] = useState(0);

  if (items.length === 0) {
    return <EmptyMenu bizName={business.name} />;
  }

  const active = Math.min(activeIndex, items.length - 1);
  const hero = items[active];
  const heroSoldOut = hero.stock_count !== null && hero.stock_count === 0;

  return (
    <div style={{ position: "relative", minHeight: "100vh", paddingBottom: 96, background: P.bg }}>
      {/* Maison header */}
      <div style={{ textAlign: "center", padding: "16px 24px 0" }}>
        <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "7px", textTransform: "uppercase", color: GOLD, fontFamily: SERIF }}>
          {business.name}
        </div>
        <div style={{ width: 44, height: 1, background: "rgba(201,169,106,0.5)", margin: "12px auto 0" }} />
      </div>

      <div style={{ display: "flex", alignItems: "stretch", padding: "24px 20px 0" }}>
        {/* Chapter rail */}
        <div
          style={{
            width: 40,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-start",
            gap: 18,
            paddingTop: 6,
            maxHeight: 460,
            overflowY: "auto",
            scrollbarWidth: "none",
          }}
        >
          {items.map((it, i) => {
            const on = i === active;
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => setActiveIndex(i)}
                aria-current={on}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  fontSize: 11,
                  letterSpacing: "2px",
                  fontWeight: on ? 900 : 400,
                  color: on ? GOLD : P.textFaint,
                  opacity: on ? 1 : 0.5,
                  transition: "color 0.2s, opacity 0.2s",
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </button>
            );
          })}
        </div>

        {/* Stage: a single object */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", paddingLeft: 12 }}>
          <div style={{ position: "relative", width: "100%", maxWidth: 260 }}>
            {hero.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={hero.photo_url} alt={hero.name} style={{ width: "100%", height: 240, objectFit: "cover", borderRadius: 8, display: "block" }} />
            ) : (
              <div style={{ width: "100%", height: 240, borderRadius: 8, background: P.surfaceElevated, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48 }}>🍽️</div>
            )}
          </div>

          <div style={{ fontSize: 9, letterSpacing: "3px", color: P.textFaint, marginTop: 22, textTransform: "uppercase" }}>
            Capítulo {String(active + 1).padStart(2, "0")}
          </div>
          <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 27, fontWeight: 500, color: P.text, marginTop: 8, lineHeight: 1.15 }}>
            {hero.name}
          </div>
          {hero.description && (
            <div style={{ fontSize: 11.5, lineHeight: 1.7, color: P.textMuted, marginTop: 10, maxWidth: 300 }}>
              {hero.description}
            </div>
          )}

          {/* Price between hairlines */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18, width: "100%", maxWidth: 220 }}>
            <div style={{ flex: 1, height: 1, background: "rgba(201,169,106,0.35)" }} />
            <span style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 600, color: GOLD }}>
              {heroSoldOut ? "Agotado" : fmtPrice(hero.price_cents)}
            </span>
            <div style={{ flex: 1, height: 1, background: "rgba(201,169,106,0.35)" }} />
          </div>

          <button
            type="button"
            onClick={() => !heroSoldOut && onItemAdd(hero)}
            disabled={heroSoldOut}
            style={{
              marginTop: 18,
              border: `1px solid ${GOLD}`,
              background: "transparent",
              color: GOLD,
              borderRadius: 999,
              padding: "10px 28px",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              cursor: heroSoldOut ? "not-allowed" : "pointer",
            }}
          >
            + Agregar
          </button>
        </div>
      </div>

      {/* Other objects — mini thumbnails */}
      <div style={{ display: "flex", gap: 12, overflowX: "auto", scrollbarWidth: "none", padding: "26px 20px 0", justifyContent: "center" }}>
        {items.map((it, i) => {
          if (i === active) return null;
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => setActiveIndex(i)}
              style={{ flexShrink: 0, width: 66, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "center" }}
            >
              {it.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.photo_url} alt={it.name} style={{ width: 66, height: 66, objectFit: "cover", borderRadius: 6, display: "block", opacity: 0.75 }} />
              ) : (
                <div style={{ width: 66, height: 66, borderRadius: 6, background: P.surfaceElevated, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🍽️</div>
              )}
              <div style={{ fontSize: 8, letterSpacing: "1px", color: P.textFaint, marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {it.name}
              </div>
              <div style={{ fontSize: 8, color: "rgba(201,169,106,0.7)" }}>{fmtPrice(it.price_cents)}</div>
            </button>
          );
        })}
      </div>

      {/* Concierge orb */}
      <button
        type="button"
        onClick={onOpenCart}
        aria-label={`Concierge · carrito, ${cartCount} artículos`}
        style={{
          position: "fixed",
          right: 22,
          bottom: 26,
          zIndex: 30,
          width: 58,
          height: 58,
          borderRadius: "50%",
          border: `1px solid ${GOLD}`,
          background: P.bg,
          color: GOLD,
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 1,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        }}
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>◇</span>
        <span style={{ fontSize: 10, fontWeight: 800 }}>{cartCount}</span>
      </button>
    </div>
  );
}
