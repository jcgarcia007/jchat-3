"use client";

import { getCategoryIcon } from "@/lib/categoryIcons";
import type { MenuTemplateProps } from "./types";
import { DenseRow } from "./shared/DenseRow";
import { EmptyMenu } from "./shared/EmptyMenu";
import { MENU_PALETTES } from "./shared/palettes";

/**
 * CategorySidebar (#05 Vertical Category Sidebar). Grocery-app pattern: a
 * permanent LEFT rail of illustrated categories runs parallel to the product
 * pane on the right, so category and product browsing happen side by side. The
 * cart clings to the right edge as a vertical pull-tab. Items render as a dense
 * list. Ported from the Menu Systems Board #05 mock, themed with public-menu
 * tokens.
 *
 * Note: MenuPageClient suppresses the shared CartFAB for this template (the
 * pull-tab is its cart affordance).
 */
const P = MENU_PALETTES["category-sidebar"]!;
const ROW_PALETTE = { card: P.surface, border: P.border, name: P.text, muted: P.textFaint, price: P.price, accent: P.accent };

export default function CategorySidebar({
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
  const RAIL_W = 88;

  if (nonEmpty.length === 0) {
    return <EmptyMenu bizName={business.name} />;
  }

  return (
    <div style={{ position: "relative", background: P.bg, minHeight: "100vh" }}>
      <div style={{ padding: "14px 16px 8px" }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: P.text, margin: 0, letterSpacing: "-0.4px" }}>
          {business.name}
        </h1>
        {business.category && (
          <div style={{ fontSize: 12, color: P.textMuted, marginTop: 2 }}>{business.category}</div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "flex-start" }}>
        {/* Left illustrated category rail */}
        <div
          style={{
            position: "sticky",
            top: 8,
            alignSelf: "flex-start",
            width: RAIL_W,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            padding: "8px 0",
            borderRight: `0.5px solid ${P.border}`,
          }}
        >
          {nonEmpty.map((cat) => {
            const active = cat.id === activeCategory;
            const TablerIcon = getCategoryIcon(cat.icon);
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => scrollToCategory(cat.id)}
                aria-current={active}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  width: 76,
                  padding: "10px 4px",
                  borderRadius: 14,
                  border: active ? `1px solid ${P.accent}` : "1px solid transparent",
                  background: active ? P.accentSoft : "transparent",
                  color: active ? P.accent : P.textMuted,
                  cursor: "pointer",
                  transition: "background 0.15s, color 0.15s, border-color 0.15s",
                }}
              >
                {cat.icon_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cat.icon_url} alt="" style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover" }} />
                ) : TablerIcon ? (
                  <TablerIcon size={24} stroke={1.5} style={{ color: "currentColor" }} />
                ) : (
                  <span style={{ fontSize: 22, lineHeight: 1 }}>{cat.icon ?? cat.name.charAt(0).toUpperCase()}</span>
                )}
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    textAlign: "center",
                    lineHeight: 1.2,
                    maxWidth: 72,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {cat.name}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right product pane */}
        <div style={{ flex: 1, minWidth: 0, paddingBottom: 24 }}>
          {nonEmpty.map((cat) => (
            <section
              key={cat.id}
              id={`cat-${cat.id}`}
              ref={(el) => {
                if (el) sectionRefs.current.set(cat.id, el);
                else sectionRefs.current.delete(cat.id);
              }}
              style={{ scrollMarginTop: 16 }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 12px 10px" }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: P.text, margin: 0 }}>{cat.name}</h2>
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
              <div style={{ padding: "0 12px", display: "flex", flexDirection: "column", gap: 10 }}>
                {cat.items.map((item) => (
                  <DenseRow key={item.id} item={item} onItemAdd={onItemAdd} palette={ROW_PALETTE} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      {/* Right-edge cart pull-tab */}
      <button
        type="button"
        onClick={onOpenCart}
        aria-label={`Ver carrito, ${cartCount} artículos`}
        style={{
          position: "fixed",
          right: 0,
          top: "50%",
          transform: "translateY(-50%)",
          zIndex: 30,
          writingMode: "vertical-rl",
          padding: "16px 8px",
          border: "none",
          borderRadius: "12px 0 0 12px",
          background: P.accent,
          color: P.accentText,
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: "1px",
          cursor: "pointer",
          boxShadow: "-6px 0 18px rgba(0,0,0,0.35)",
        }}
      >
        CARRITO · {cartCount}
      </button>
    </div>
  );
}
