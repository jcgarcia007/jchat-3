"use client";
import { IconShoppingCart } from "@tabler/icons-react";

import type { MenuTemplateProps } from "./types";
import type { PublicMenuItem } from "../page";
import { EmptyMenu } from "./shared/EmptyMenu";
import { fmtPrice } from "./shared/format";
import { useMenuPalette } from "./shared/paletteContext";

/**
 * StreamingRows (#13 Streaming-Style Rows). Concessions browsed like a streaming
 * catalog: each category is a horizontal shelf with an editorial name and a row
 * of landscape tiles. Vertical scroll switches "genre", horizontal scroll digs
 * deeper. A floating cart FAB stays in view. Ported from the Menu Systems Board
 * #13 mock, themed with public-menu tokens.
 *
 * Note: MenuPageClient suppresses the shared CartFAB — the floating FAB below is
 * this template's cart affordance.
 */

// A landscape (16:9-ish) tile with title/price over a bottom gradient.

function LandscapeTile({
  item,
  onItemAdd,
}: {
  item: PublicMenuItem;
  onItemAdd: (item: PublicMenuItem) => void;
}) {
  const P = useMenuPalette();
  const soldOut = item.stock_count !== null && item.stock_count === 0;
  return (
    <div style={{ flexShrink: 0, width: 200 }}>
      <div style={{ position: "relative", borderRadius: 10, overflow: "hidden" }}>
        {item.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.photo_url} alt={item.name} style={{ width: 200, height: 112, objectFit: "cover", display: "block" }} />
        ) : (
          <div style={{ width: 200, height: 112, background: P.surface, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>🍽️</div>
        )}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, transparent 45%, rgba(0,0,0,0.85))",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            padding: 10,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.name}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: P.price }}>
              {soldOut ? "Agotado" : fmtPrice(item.price_cents)}
            </span>
            <button
              type="button"
              onClick={() => !soldOut && onItemAdd(item)}
              disabled={soldOut}
              aria-label={`Agregar ${item.name}`}
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                border: "none",
                background: soldOut ? "rgba(255,255,255,0.25)" : P.accent,
                color: "#fff",
                fontSize: 17,
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
      </div>
    </div>
  );
}

export default function StreamingRows({
  business,
  categories,
  scrollToCategory,
  sectionRefs,
  onItemAdd,
  cartCount,
  onOpenCart,
}: MenuTemplateProps) {
  const P = useMenuPalette();
  const nonEmpty = categories.filter((c) => c.items.length > 0);

  if (nonEmpty.length === 0) {
    return <EmptyMenu bizName={business.name} />;
  }

  return (
    <div style={{ position: "relative", paddingBottom: 32, background: P.bg, minHeight: "100vh" }}>
      {/* Marquee header */}
      <div style={{ padding: "14px 16px 8px" }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, letterSpacing: "0.5px", color: P.accent, margin: 0, textTransform: "uppercase" }}>
          {business.name}
        </h1>
        <div style={{ fontSize: 12.5, color: P.textMuted, marginTop: 3 }}>
          {business.category ? `${business.category} · ` : ""}Entrega en tu asiento
        </div>
      </div>

      {/* Horizontal shelves per category */}
      {nonEmpty.map((cat) => (
        <section
          key={cat.id}
          id={`cat-${cat.id}`}
          ref={(el) => {
            if (el) sectionRefs.current.set(cat.id, el);
            else sectionRefs.current.delete(cat.id);
          }}
          style={{ scrollMarginTop: 16, marginTop: 18 }}
        >
          <button
            type="button"
            onClick={() => scrollToCategory(cat.id)}
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              width: "100%",
              gap: 8,
              padding: "0 16px 10px",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            <span style={{ fontSize: 16, fontWeight: 800, color: P.text }}>{cat.name}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: P.textFaint }}>VER TODO →</span>
          </button>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", scrollbarWidth: "none", padding: "0 16px" }}>
            {cat.items.map((item) => (
              <LandscapeTile key={item.id} item={item} onItemAdd={onItemAdd} />
            ))}
          </div>
        </section>
      ))}

      {/* Floating cart FAB — sticky wrapper pins it to the column's
          bottom-right while scrolling (shell transform breaks fixed). */}
      <div
        style={{
          position: "sticky",
          bottom: 20,
          zIndex: 30,
          display: "flex",
          justifyContent: "flex-end",
          paddingRight: 16,
          pointerEvents: "none",
        }}
      >
      <button
        type="button"
        onClick={onOpenCart}
        aria-label={`Ver carrito, ${cartCount} artículos`}
        style={{
          position: "relative",
          pointerEvents: "auto",
          width: 54,
          height: 54,
          borderRadius: "50%",
          border: "none",
          background: P.accent,
          color: "#fff",
          fontSize: 22,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 10px 26px rgba(0,0,0,0.45)",
        }}
      >
        <IconShoppingCart size={22} />
        {cartCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: -2,
              right: -2,
              minWidth: 20,
              height: 20,
              borderRadius: 99,
              background: P.price,
              color: "#1a1206",
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
    </div>
  );
}
