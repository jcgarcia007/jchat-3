"use client";

import { useEffect, useRef } from "react";
import { getCategoryIcon } from "@/lib/categoryIcons";
import type { PublicMenuCategory } from "../page";
import type { MenuTemplateProps } from "./types";
import type { CardEffect } from "./shared/effects";
import { CategorySection } from "./shared/CategorySection";
import { EmptyMenu } from "./shared/EmptyMenu";

const BOTTOM_NAV_H = 64; // px — height of the fixed bottom bar

/**
 * BottomNav — tab bar at the bottom + full-page category sections.
 *
 * UX:
 * - Content scrolls continuously; scroll-spy (from parent) keeps the active
 *   tab highlighted.
 * - Tapping a tab calls scrollToCategory (parent scroll helper) — no local
 *   state needed.
 * - The content area has paddingBottom so no item is hidden behind the nav.
 */
export default function BottomNav({
  business,
  categories,
  activeCategory,
  scrollToCategory,
  sectionRefs,
  onItemAdd,
  cartCount,
  cartTotal,
  onOpenCart,
  cardEffect,
  hoveredCardId,
  mousePos,
  onCardEnter,
  onCardLeave,
  onCardMove,
}: MenuTemplateProps) {
  const tabBarRef = useRef<HTMLDivElement>(null);

  // Keep the active tab chip scrolled into view when scroll-spy fires.
  useEffect(() => {
    if (!activeCategory) return;
    const el = tabBarRef.current?.querySelector<HTMLButtonElement>(
      `[data-cat="${activeCategory}"]`
    );
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeCategory]);

  const activeCatId = activeCategory || categories[0]?.id || "";

  return (
    <div style={{ position: "relative" }}>
      {/* ── Main content ─────────────────────────────────────────────── */}
      <main
        style={{
          maxWidth: 680,
          margin: "0 auto",
          padding: `0 0 ${BOTTOM_NAV_H + 24}px`,
        }}
      >
        {categories.length === 0 ? (
          <EmptyMenu bizName={business.name} />
        ) : (
          categories.map((cat: PublicMenuCategory) => (
            <CategorySection
              key={cat.id}
              category={cat}
              sectionRef={(el) => {
                if (el) sectionRefs.current.set(cat.id, el);
                else sectionRefs.current.delete(cat.id);
              }}
              effect={cardEffect as CardEffect}
              hoveredCardId={hoveredCardId}
              mx={mousePos.mx}
              my={mousePos.my}
              onCardEnter={onCardEnter}
              onCardLeave={onCardLeave}
              onCardMove={onCardMove}
              onItemAdd={onItemAdd}
            />
          ))
        )}
      </main>

      {/* ── Fixed bottom nav ─────────────────────────────────────────── */}
      <nav
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          height: BOTTOM_NAV_H,
          background: "var(--bg-base)",
          borderTop: "1px solid var(--border-subtle)",
          boxShadow: "0 -2px 12px rgba(0,0,0,0.25)",
          zIndex: 30,
          display: "flex",
          alignItems: "stretch",
        }}
      >
        {/* Scrollable tab strip */}
        <div
          ref={tabBarRef}
          style={{
            display: "flex",
            overflowX: "auto",
            flex: 1,
            scrollbarWidth: "none",
            alignItems: "center",
            gap: 2,
            padding: "0 8px",
          }}
        >
          {categories.map((cat: PublicMenuCategory) => {
            const active = cat.id === activeCatId;
            const TablerIcon = getCategoryIcon(cat.icon);
            return (
              <button
                key={cat.id}
                data-cat={cat.id}
                onClick={() => scrollToCategory(cat.id)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 3,
                  padding: "6px 12px",
                  minWidth: 56,
                  flexShrink: 0,
                  borderRadius: "var(--radius-md, 10px)",
                  border: "none",
                  background: active ? "var(--color-brand-light, rgba(92,124,250,0.12))" : "transparent",
                  color: active ? "var(--color-brand, #5C7CFA)" : "var(--text-muted)",
                  cursor: "pointer",
                  transition: "background 0.15s, color 0.15s",
                  whiteSpace: "nowrap",
                }}
              >
                {TablerIcon
                  ? <TablerIcon size={20} stroke={active ? 2 : 1.5} style={{ flexShrink: 0, color: "currentColor" }} />
                  : cat.icon
                    ? <span style={{ fontSize: 18, lineHeight: 1 }}>{cat.icon}</span>
                    : null
                }
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: active ? 700 : 500,
                    maxWidth: 72,
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

        {/* Cart FAB (only when there are items in the cart) */}
        {cartCount > 0 && (
          <button
            onClick={onOpenCart}
            style={{
              flexShrink: 0,
              alignSelf: "center",
              marginRight: 12,
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 999,
              border: "none",
              background: "var(--color-brand, #5C7CFA)",
              color: "#fff",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(92,124,250,0.4)",
              whiteSpace: "nowrap",
            }}
          >
            🛒 {cartCount}
          </button>
        )}
      </nav>
    </div>
  );
}
