"use client";
import { IconShoppingCart } from "@tabler/icons-react";

import type { MenuTemplateProps } from "./types";
import type { PublicMenuItem } from "../page";
import { EmptyMenu } from "./shared/EmptyMenu";
import { fmtPrice } from "./shared/format";
import { MENU_PALETTES } from "./shared/palettes";

/**
 * GlassChips (#07 Floating Category Chips). Imagery goes edge-to-edge in a
 * full-bleed photo grid; all chrome floats above it on frosted glass. Category
 * chips hover over the feed; a single opaque cart FAB is the only solid element.
 * Ported from the Menu Systems Board #07 mock, themed with public-menu tokens.
 *
 * Note: MenuPageClient suppresses the shared CartFAB for this template — the
 * bottom-right circular FAB below is its cart affordance (persistent, opaque),
 * which differs from the global bottom-center pill.
 */

// A full-bleed card: the photo IS the card, with info over a bottom gradient.
const P = MENU_PALETTES["glass-chips"]!;

function FullBleedCard({
  item,
  onItemAdd,
}: {
  item: PublicMenuItem;
  onItemAdd: (item: PublicMenuItem) => void;
}) {
  const soldOut = item.stock_count !== null && item.stock_count === 0;
  return (
    <div
      style={{
        position: "relative",
        aspectRatio: "3 / 4",
        borderRadius: 16,
        overflow: "hidden",
        background: P.surface,
      }}
    >
      {item.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.photo_url}
          alt={item.name}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34 }}>
          🍽️
        </div>
      )}

      {/* Bottom gradient + info */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          padding: "28px 10px 10px",
          background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.88))",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.name}
          </div>
          <div style={{ fontSize: 12, fontWeight: 800, color: P.price, marginTop: 2 }}>
            {soldOut ? "Agotado" : fmtPrice(item.price_cents)}
          </div>
        </div>
        <button
          type="button"
          onClick={() => !soldOut && onItemAdd(item)}
          disabled={soldOut}
          aria-label={`Agregar ${item.name}`}
          style={{
            flexShrink: 0,
            width: 30,
            height: 30,
            borderRadius: "50%",
            border: "none",
            background: soldOut ? "rgba(255,255,255,0.2)" : P.accent,
            color: "#fff",
            fontSize: 18,
            fontWeight: 700,
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: soldOut ? "not-allowed" : "pointer",
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}

export default function GlassChips({
  business,
  categories,
  activeCategory,
  scrollToCategory,
  sectionRefs,
  onItemAdd,
  cartCount,
  onOpenCart,
}: MenuTemplateProps) {
  const nonEmpty = categories.filter((c) => c.items.length > 0);

  if (nonEmpty.length === 0) {
    return <EmptyMenu bizName={business.name} />;
  }

  return (
    <div style={{ position: "relative", paddingBottom: 32, background: P.bg, minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ padding: "16px 16px 4px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: P.text, margin: 0, letterSpacing: "-0.4px" }}>
          {business.name}
        </h1>
      </div>
      {/* Floating glassmorphism chips */}
      <div
        style={{
          position: "sticky",
          top: 8,
          zIndex: 20,
          margin: "8px 12px 0",
          padding: "8px 10px",
          borderRadius: 16,
          background: "rgba(255,255,255,0.08)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "0.5px solid rgba(255,255,255,0.14)",
        }}
      >
        <div style={{ display: "flex", gap: 8, overflowX: "auto", scrollbarWidth: "none" }}>
          <button
            type="button"
            onClick={() => scrollToCategory(nonEmpty[0].id)}
            style={chipStyle(false)}
          >
            Todo
          </button>
          {nonEmpty.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => scrollToCategory(cat.id)}
              style={chipStyle(cat.id === activeCategory)}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Full-bleed photo grid, per category */}
      {nonEmpty.map((cat) => (
        <section
          key={cat.id}
          id={`cat-${cat.id}`}
          ref={(el) => {
            if (el) sectionRefs.current.set(cat.id, el);
            else sectionRefs.current.delete(cat.id);
          }}
          style={{ scrollMarginTop: 64 }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", color: P.textFaint, padding: "16px 12px 8px" }}>
            {cat.name}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, padding: "0 12px" }}>
            {cat.items.map((item) => (
              <FullBleedCard key={item.id} item={item} onItemAdd={onItemAdd} />
            ))}
          </div>
        </section>
      ))}

      {/* Single opaque cart FAB (bottom-right) */}
      <button
        type="button"
        onClick={onOpenCart}
        aria-label={`Ver carrito, ${cartCount} artículos`}
        style={{
          position: "fixed",
          right: 16,
          bottom: 20,
          zIndex: 30,
          width: 58,
          height: 58,
          borderRadius: "50%",
          border: "none",
          background: P.accent,
          color: P.accentText,
          fontSize: 22,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 10px 26px rgba(217,119,6,0.4)",
        }}
      >
        <IconShoppingCart size={24} />
        {cartCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: -2,
              right: -2,
              minWidth: 20,
              height: 20,
              borderRadius: 99,
              background: P.accent,
              color: "#fff",
              fontSize: 11,
              fontWeight: 900,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 5px",
              border: `2px solid ${P.bg}`,
            }}
          >
            {cartCount}
          </span>
        )}
      </button>
    </div>
  );
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    flexShrink: 0,
    padding: "6px 14px",
    borderRadius: 999,
    border: active ? `1px solid ${P.accent}` : "1px solid rgba(255,255,255,0.18)",
    background: active ? P.accent : "rgba(255,255,255,0.1)",
    color: active ? P.accentText : P.text,
    fontSize: 13,
    fontWeight: active ? 700 : 500,
    whiteSpace: "nowrap",
    cursor: "pointer",
  };
}
