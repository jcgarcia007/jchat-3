"use client";
import { IconShoppingCart } from "@tabler/icons-react";

import { useState } from "react";
import type { MenuTemplateProps } from "./types";
import type { PublicMenuItem } from "../page";
import { EmptyMenu } from "./shared/EmptyMenu";
import { fmtPrice } from "./shared/format";
import { useMenuPalette } from "./shared/paletteContext";

/**
 * FullscreenType (#06 Full-Screen Menu Takeover). The menu IS the interface:
 * courses render as an oversized typographic index; tapping one expands its
 * dishes in place as a horizontal shelf (accordion, one open at a time). No
 * chrome, no tabs — pure editorial confidence for fine dining. Ported from the
 * Menu Systems Board #06 mock, themed with public-menu tokens.
 *
 * Note: MenuPageClient suppresses the shared CartFAB — the header cart-icon pill is
 * this template's cart affordance.
 */

// A course dish tile inside an expanded shelf.
function CourseTile({
  item,
  onItemAdd,
}: {
  item: PublicMenuItem;
  onItemAdd: (item: PublicMenuItem) => void;
}) {
  const P = useMenuPalette();
  const soldOut = item.stock_count !== null && item.stock_count === 0;
  return (
    <div style={{ flexShrink: 0, width: 150 }}>
      {item.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.photo_url} alt={item.name} style={{ width: 150, height: 110, objectFit: "cover", borderRadius: 10, display: "block" }} />
      ) : (
        <div style={{ width: 150, height: 110, borderRadius: 10, background: P.surface, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>🍽️</div>
      )}
      <div style={{ fontSize: 13, fontWeight: 600, color: P.text, marginTop: 8, lineHeight: 1.25 }}>{item.name}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 4 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: P.accent }}>
          {soldOut ? "Agotado" : fmtPrice(item.price_cents)}
        </span>
        <button
          type="button"
          onClick={() => !soldOut && onItemAdd(item)}
          disabled={soldOut}
          aria-label={`Agregar ${item.name}`}
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            border: `1px solid ${P.border}`,
            background: "transparent",
            color: P.text,
            fontSize: 16,
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
}

const NUM = (i: number) => String(i + 1).padStart(2, "0");


export default function FullscreenType({
  business,
  categories,
  onItemAdd,
  cartCount,
  onOpenCart,
}: MenuTemplateProps) {
  const P = useMenuPalette();
  const nonEmpty = categories.filter((c) => c.items.length > 0);
  const [expanded, setExpanded] = useState<string | null>(nonEmpty[0]?.id ?? null);

  if (nonEmpty.length === 0) {
    return <EmptyMenu bizName={business.name} />;
  }

  return (
    <div style={{ background: P.bg, minHeight: "100vh", maxWidth: 680, margin: "0 auto", padding: "6px 0 40px" }}>
      {/* Discreet header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 24px 18px" }}>
        <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: "4px", textTransform: "uppercase", color: P.accent }}>
          {business.name}
        </span>
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
            background: "transparent",
            color: P.text,
            fontSize: 12.5,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          <IconShoppingCart size={15} style={{ verticalAlign: "-2px", marginRight: 3 }} />{cartCount}
        </button>
      </div>

      {/* Typographic index (accordion) */}
      {nonEmpty.map((cat, i) => {
        const open = expanded === cat.id;
        return (
          <div key={cat.id} style={{ borderTop: `0.5px solid ${P.border}` }}>
            <button
              type="button"
              onClick={() => setExpanded((c) => (c === cat.id ? null : cat.id))}
              aria-expanded={open}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 14,
                width: "100%",
                padding: "18px 24px",
                background: "none",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                opacity: open ? 1 : 0.5,
                transition: "opacity 0.2s",
              }}
            >
              <span style={{ fontSize: 11, color: P.accent, flexShrink: 0 }}>{NUM(i)}</span>
              <span style={{ fontSize: 34, fontWeight: 500, color: P.text, lineHeight: 1 }}>{cat.name}</span>
              <span style={{ marginLeft: "auto", fontSize: 10, letterSpacing: "2px", color: P.textFaint, flexShrink: 0, alignSelf: "center" }}>
                {cat.items.length} {cat.items.length === 1 ? "PLATO" : "PLATOS"}
              </span>
            </button>

            {open && (
              <div style={{ display: "flex", gap: 12, overflowX: "auto", scrollbarWidth: "none", padding: "0 24px 22px" }}>
                {cat.items.map((item) => (
                  <CourseTile key={item.id} item={item} onItemAdd={onItemAdd} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
