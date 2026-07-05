"use client";
import { IconShoppingCart } from "@tabler/icons-react";

import type { MenuTemplateProps } from "./types";
import { DenseRow } from "./shared/DenseRow";
import { EmptyMenu } from "./shared/EmptyMenu";
import { fmtPrice } from "./shared/format";
import { useMenuPalette } from "./shared/paletteContext";

/**
 * StickyTabs (#04 Horizontal Sticky Tabs). One long sectioned page; the tabs pin
 * under the header and track scroll position (the underline follows the active
 * category via scroll-spy). Rows favor reading speed (dense list). A sticky cart
 * bar sits at the bottom. Ported from the Menu Systems Board #04 mock, themed
 * with public-menu tokens.
 *
 * Note: MenuPageClient suppresses the shared CartFAB for this template so the
 * sticky bottom cart bar is the only cart affordance.
 */
export default function StickyTabs({
  business,
  categories,
  activeCategory,
  scrollToCategory,
  sectionRefs,
  onItemAdd,
  cartCount,
  cartTotal,
  onOpenCart,
}: MenuTemplateProps) {
  const P = useMenuPalette();
  const ROW_PALETTE = { card: P.surface, border: P.border, name: P.text, muted: P.textFaint, price: P.price, accent: P.accent };
  const nonEmpty = categories.filter((c) => c.items.length > 0);

  if (nonEmpty.length === 0) {
    return <EmptyMenu bizName={business.name} />;
  }

  return (
    <div style={{ background: P.bg, minHeight: "100vh", paddingBottom: 16 }}>
      {/* Header */}
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "14px 16px 10px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: P.text, margin: 0, letterSpacing: "-0.5px" }}>
          {business.name}
        </h1>
        {business.category && (
          <div style={{ fontSize: 12.5, color: P.textMuted, marginTop: 3 }}>{business.category}</div>
        )}
      </div>

      {/* Sticky scroll-spy tabs */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: P.bg,
          borderBottom: `1px solid ${P.border}`,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 22,
            padding: "12px 16px 0",
            overflowX: "auto",
            scrollbarWidth: "none",
            maxWidth: 680,
            margin: "0 auto",
          }}
        >
          {nonEmpty.map((cat) => {
            const active = cat.id === activeCategory;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => scrollToCategory(cat.id)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "0 0 10px",
                  fontSize: 14,
                  fontWeight: active ? 700 : 500,
                  color: active ? P.text : P.textMuted,
                  borderBottom: `2px solid ${active ? P.accent : "transparent"}`,
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  transition: "color 0.15s, border-color 0.15s",
                }}
              >
                {cat.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sections (dense list) */}
      {nonEmpty.map((cat) => (
        <section
          key={cat.id}
          id={`cat-${cat.id}`}
          ref={(el) => {
            if (el) sectionRefs.current.set(cat.id, el);
            else sectionRefs.current.delete(cat.id);
          }}
          style={{ scrollMarginTop: 52 }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "18px 16px 10px", maxWidth: 680, margin: "0 auto" }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: P.text, margin: 0 }}>{cat.name}</h2>
            <span
              style={{
                fontSize: 11,
                color: P.textFaint,
                background: P.surface,
                border: `1px solid ${P.border}`,
                borderRadius: 10,
                padding: "1px 7px",
              }}
            >
              {cat.items.length}
            </span>
          </div>
          <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 16px", display: "flex", flexDirection: "column", gap: 10 }}>
            {cat.items.map((item) => (
              <DenseRow key={item.id} item={item} onItemAdd={onItemAdd} palette={ROW_PALETTE} />
            ))}
          </div>
        </section>
      ))}

      {/* Sticky cart bar */}
      <button
        type="button"
        onClick={onOpenCart}
        style={{
          position: "sticky",
          bottom: 16,
          margin: "0 auto",
          width: "calc(100% - 32px)",
          maxWidth: 648,
          zIndex: 30,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "15px 18px",
          borderRadius: 16,
          border: "none",
          cursor: "pointer",
          background: P.surface,
          boxShadow: "0 12px 28px rgba(0,0,0,0.4)",
        }}
      >
        <span style={{ fontSize: 13.5, fontWeight: 700, color: P.text }}><IconShoppingCart size={15} style={{ verticalAlign: "-3px", marginRight: 5 }} />Ver carrito · {cartCount}</span>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: P.price }}>{fmtPrice(cartTotal)}</span>
      </button>
    </div>
  );
}
