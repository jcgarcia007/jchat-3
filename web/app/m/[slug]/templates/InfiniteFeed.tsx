"use client";

import type { MenuTemplateProps } from "./types";
import type { PublicMenuItem } from "../page";
import { EmptyMenu } from "./shared/EmptyMenu";
import { fmtPrice } from "./shared/format";
import { MENU_PALETTES } from "./shared/palettes";

/**
 * InfiniteFeed (#08 Infinite Vertical Feed). Built for a stadium seat: NO
 * categories, just one loud vertical feed of full-width billboard cards with a
 * giant add target, and a gradient cart bar at the bottom. All items from all
 * categories are flattened into a single scroll. Ported from the Menu Systems
 * Board #08 mock, themed with public-menu tokens.
 *
 * Note: no scroll-spy (there are no categories); activeCategory /
 * scrollToCategory are unused. MenuPageClient suppresses the shared CartFAB —
 * the gradient bottom bar is this template's cart affordance.
 */

const P = MENU_PALETTES["infinite-feed"]!;

function Billboard({
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
        background: P.surfaceElevated,
        border: `1px solid ${P.border}`,
        borderRadius: 20,
        overflow: "hidden",
        marginBottom: 14,
      }}
    >
      <div style={{ position: "relative", height: 180 }}>
        {item.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.photo_url}
            alt={item.name}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, background: P.surface }}>
            🍽️
          </div>
        )}
        {item.badge && (
          <span
            style={{
              position: "absolute",
              top: 10,
              left: 10,
              padding: "3px 9px",
              borderRadius: 999,
              background: "rgba(0,0,0,0.65)",
              color: "#fff",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.5px",
              textTransform: "uppercase",
            }}
          >
            {item.badge.replace(/_/g, " ")}
          </span>
        )}
      </div>

      <div style={{ padding: "14px 16px 16px" }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: P.text }}>{item.name}</div>
        {item.description && (
          <div style={{ fontSize: 13, color: P.textMuted, marginTop: 4, lineHeight: 1.45 }}>
            {item.description}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 12 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: P.accent }}>
            {soldOut ? "Agotado" : fmtPrice(item.price_cents)}
          </span>
          <button
            type="button"
            onClick={() => !soldOut && onItemAdd(item)}
            disabled={soldOut}
            aria-label={`Agregar ${item.name}`}
            style={{
              width: 48,
              height: 48,
              borderRadius: 16,
              border: "none",
              background: soldOut ? P.surface : P.accent,
              color: P.accentText,
              fontSize: 26,
              fontWeight: 700,
              lineHeight: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: soldOut ? "not-allowed" : "pointer",
              flexShrink: 0,
              boxShadow: soldOut ? "none" : "0 8px 20px rgba(255,214,10,0.3)",
            }}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}

export default function InfiniteFeed({
  business,
  categories,
  onItemAdd,
  cartCount,
  cartTotal,
  onOpenCart,
}: MenuTemplateProps) {
  const items = categories.flatMap((c) => c.items);

  if (items.length === 0) {
    return <EmptyMenu bizName={business.name} />;
  }

  return (
    <div style={{ background: P.bg, minHeight: "100vh", maxWidth: 680, margin: "0 auto", padding: "12px 16px 96px" }}>
      {/* Header */}
      <div style={{ padding: "6px 2px 16px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: P.text, margin: 0, letterSpacing: "-0.5px" }}>
          {business.name}
        </h1>
        <div style={{ fontSize: 13, color: P.textMuted, marginTop: 3 }}>
          Entrega a tu mesa · lo más pedido
        </div>
      </div>

      {/* Single billboard feed */}
      {items.map((item) => (
        <Billboard key={item.id} item={item} onItemAdd={onItemAdd} />
      ))}

      {/* Gradient cart bar */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 30,
          padding: "40px 16px 18px",
          background: `linear-gradient(180deg, transparent, ${P.bg} 55%)`,
          pointerEvents: "none",
        }}
      >
        <button
          type="button"
          onClick={onOpenCart}
          style={{
            pointerEvents: "auto",
            width: "100%",
            maxWidth: 648,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "15px 18px",
            borderRadius: 14,
            border: "none",
            cursor: "pointer",
            background: P.accent,
            color: P.accentText,
            boxShadow: "0 10px 26px rgba(255,214,10,0.35)",
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 800 }}>Carrito ({cartCount})</span>
          <span style={{ fontSize: 14, fontWeight: 800 }}>{fmtPrice(cartTotal)} · A tu mesa →</span>
        </button>
      </div>
    </div>
  );
}
