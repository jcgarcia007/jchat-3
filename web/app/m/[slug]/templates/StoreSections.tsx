"use client";
import { IconShoppingCart } from "@tabler/icons-react";

import type { MenuTemplateProps } from "./types";
import type { PublicMenuItem } from "../page";
import { EmptyMenu } from "./shared/EmptyMenu";
import { fmtPrice } from "./shared/format";
import { useMenuPalette } from "./shared/paletteContext";

/**
 * StoreSections (#12 Store-Style Sections). Retail / hotel room-service feel: a
 * calm greeting, then each category is a big self-contained card with a headline
 * and a horizontal shelf of product tiles. Generous whitespace does the
 * wayfinding. Ported from the Menu Systems Board #12 mock, themed with
 * public-menu tokens.
 *
 * Note: MenuPageClient suppresses the shared CartFAB for this template (the top
 * "Bolsa" pill is its cart affordance).
 */

// A single product tile inside a category shelf (photo on top, name/price/add).
function ShelfTile({
  item,
  onItemAdd,
}: {
  item: PublicMenuItem;
  onItemAdd: (item: PublicMenuItem) => void;
}) {
  const P = useMenuPalette();
  const soldOut = item.stock_count !== null && item.stock_count === 0;
  return (
    <div style={{ flexShrink: 0, width: 148 }}>
      {item.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.photo_url}
          alt={item.name}
          style={{ width: 148, height: 108, borderRadius: 16, objectFit: "cover", display: "block" }}
        />
      ) : (
        <div
          style={{
            width: 148,
            height: 108,
            borderRadius: 16,
            background: P.surface,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 30,
          }}
        >
          🍽️
        </div>
      )}
      <div style={{ marginTop: 8, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: P.text,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {item.name}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: P.price, marginTop: 2 }}>
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
            width: 28,
            height: 28,
            borderRadius: "50%",
            border: "none",
            background: soldOut ? P.surface : P.accent,
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


export default function StoreSections({
  business,
  categories,
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
    <div style={{ background: P.bg, minHeight: "100vh", maxWidth: 680, margin: "0 auto", padding: "8px 16px 32px" }}>
      {/* Top bar: business + bag pill */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "6px 2px 4px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.5px", color: P.textFaint, textTransform: "uppercase" }}>
          {business.name}
        </span>
        <button
          type="button"
          onClick={onOpenCart}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 14px",
            borderRadius: 999,
            border: `1px solid ${P.border}`,
            background: P.surface,
            color: P.text,
            fontSize: 12.5,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          <IconShoppingCart size={15} style={{ verticalAlign: "-2px", marginRight: 4 }} />Bolsa · {cartCount}
        </button>
      </div>

      {/* Greeting */}
      <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-1px", color: P.text, padding: "10px 2px 18px" }}>
        Bienvenido.
      </div>

      {/* Category cards with horizontal shelves */}
      {nonEmpty.map((cat) => (
        <section
          key={cat.id}
          id={`cat-${cat.id}`}
          ref={(el) => {
            if (el) sectionRefs.current.set(cat.id, el);
            else sectionRefs.current.delete(cat.id);
          }}
          style={{
            scrollMarginTop: 16,
            background: P.surfaceElevated,
            border: `1px solid ${P.border}`,
            borderRadius: 20,
            padding: "18px 0 18px 18px",
            marginBottom: 16,
          }}
        >
          <div style={{ paddingRight: 18 }}>
            <h2 style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.3px", color: P.text, margin: 0 }}>
              {cat.name}
            </h2>
            <div style={{ fontSize: 12.5, color: P.textMuted, marginTop: 2 }}>
              {cat.items.length} {cat.items.length === 1 ? "platillo" : "platillos"}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 12,
              overflowX: "auto",
              scrollbarWidth: "none",
              marginTop: 14,
              paddingRight: 18,
            }}
          >
            {cat.items.map((item) => (
              <ShelfTile key={item.id} item={item} onItemAdd={onItemAdd} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
