"use client";

import { getCategoryIcon } from "@/lib/categoryIcons";
import type { MenuTemplateProps } from "./types";
import { DenseRow } from "./shared/DenseRow";
import { EmptyMenu } from "./shared/EmptyMenu";
import { fmtPrice } from "./shared/format";

/**
 * IconRail (#03 Right-Hand Icon Rail). Categories live on a permanent thumb-side
 * rail on the RIGHT (one-handed use); the active icon glows and the list filters
 * by scroll. A docked mini-cart keeps the total in view. Items render as a dense
 * list. Ported from the Menu Systems Board #03 mock, themed with public-menu
 * tokens (not the mock's palette).
 *
 * Note: MenuPageClient suppresses the shared CartFAB for this template so the
 * docked mini-cart is the only cart affordance.
 */
export default function IconRail({
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
  const nonEmpty = categories.filter((c) => c.items.length > 0);
  const RAIL_W = 68;

  if (nonEmpty.length === 0) {
    return <EmptyMenu bizName={business.name} />;
  }

  const tagline = nonEmpty.map((c) => c.name).join(" · ");

  return (
    <div style={{ position: "relative", paddingBottom: 84 }}>
      <div style={{ display: "flex", alignItems: "flex-start", maxWidth: 680, margin: "0 auto" }}>
        {/* Body */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ padding: "14px 16px 6px" }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.5px" }}>
              {business.name}
            </h1>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 800,
                letterSpacing: "1px",
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                marginTop: 4,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {tagline}
            </div>
          </div>

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
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 12px 10px" }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{cat.name}</h2>
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--text-tertiary)",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 10,
                    padding: "1px 7px",
                  }}
                >
                  {cat.items.length}
                </span>
              </div>
              <div style={{ padding: "0 12px", display: "flex", flexDirection: "column", gap: 10 }}>
                {cat.items.map((item) => (
                  <DenseRow key={item.id} item={item} onItemAdd={onItemAdd} />
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Right icon rail (sticky) */}
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
            padding: "10px 0",
            marginLeft: 4,
            borderLeft: "0.5px solid var(--border-subtle)",
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
                aria-label={cat.name}
                aria-current={active}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 3,
                  width: 56,
                  padding: "9px 2px",
                  borderRadius: 12,
                  border: "none",
                  cursor: "pointer",
                  background: active ? "rgba(217,119,6,0.15)" : "transparent",
                  color: active ? "var(--color-gold)" : "var(--text-tertiary)",
                  boxShadow: active ? "0 0 0 1px var(--color-gold), 0 6px 16px rgba(217,119,6,0.25)" : "none",
                  transition: "background 0.15s, color 0.15s, box-shadow 0.15s",
                }}
              >
                {cat.icon_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cat.icon_url}
                    alt=""
                    style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover" }}
                  />
                ) : TablerIcon ? (
                  <TablerIcon size={20} stroke={1.5} style={{ color: "currentColor" }} />
                ) : (
                  <span style={{ fontSize: 17, lineHeight: 1 }}>
                    {cat.icon ?? cat.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <span
                  style={{
                    fontSize: 7.5,
                    fontWeight: 900,
                    letterSpacing: "0.4px",
                    textTransform: "uppercase",
                    maxWidth: 54,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {cat.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Docked mini-cart */}
      <button
        type="button"
        onClick={onOpenCart}
        style={{
          position: "fixed",
          bottom: 16,
          left: "50%",
          transform: "translateX(-50%)",
          width: "calc(100% - 32px)",
          maxWidth: 648,
          zIndex: 30,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "13px 18px",
          borderRadius: 16,
          border: "none",
          cursor: "pointer",
          background: "var(--color-gold)",
          color: "#1a1206",
          boxShadow: "0 10px 24px rgba(217,119,6,0.3)",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 800 }}>🛒 Carrito · {cartCount}</span>
        <span style={{ fontSize: 13, fontWeight: 800 }}>{fmtPrice(cartTotal)} →</span>
      </button>
    </div>
  );
}
