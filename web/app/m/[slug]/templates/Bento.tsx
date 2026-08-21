"use client";

import type { MenuTemplateProps } from "./types";
import type { CardEffect } from "./shared/effects";
import type { PublicMenuCategory } from "../page";
import { ItemCard } from "./shared/CategorySection";
import { EmptyMenu } from "./shared/EmptyMenu";
import { getCategoryIcon } from "@/lib/categoryIcons";

/**
 * Bento (#23) — per-category CSS grid with variable-span cells.
 * The first item of each category and every 6th item thereafter spans
 * 2 columns, giving the bento visual rhythm. grid-auto-flow:dense
 * fills any gaps left by the wider cells.
 *
 * ItemCard is reused directly so carrito, customizer, and sold-out
 * logic are all inherited — no re-implementation needed.
 */
export default function Bento({
  business,
  categories,
  sectionRefs,
  onItemAdd,
  cardEffect,
  hoveredCardId,
  mousePos,
  onCardEnter,
  onCardLeave,
  onCardMove,
}: MenuTemplateProps) {
  const nonEmpty = categories.filter((c) => c.items.length > 0);
  if (nonEmpty.length === 0) return <EmptyMenu bizName={business.name} />;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 12px 32px" }}>
      {nonEmpty.map((cat: PublicMenuCategory) => (
        <section
          key={cat.id}
          id={`cat-${cat.id}`}
          ref={(el) => {
            if (el) sectionRefs.current.set(cat.id, el);
            else sectionRefs.current.delete(cat.id);
          }}
          style={{ scrollMarginTop: 56 }}
        >
          {/* Category header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "20px 4px 12px",
            }}
          >
            {cat.icon_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cat.icon_url}
                alt=""
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  objectFit: "cover",
                  flexShrink: 0,
                  border: "1.5px solid rgba(217,119,6,0.5)",
                }}
              />
            ) : (() => {
              const TablerIcon = getCategoryIcon(cat.icon);
              if (TablerIcon)
                return <TablerIcon size={22} stroke={1.5} color="var(--color-gold)" />;
              if (cat.icon)
                return <span style={{ fontSize: 20 }}>{cat.icon}</span>;
              return null;
            })()}
            <h2
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: "var(--text-primary)",
                margin: 0,
              }}
            >
              {cat.name}
            </h2>
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

          {/* Bento grid — 3 columns, dense packing */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gridAutoFlow: "dense",
              gap: 10,
            }}
          >
            {cat.items.map((item, idx) => {
              // First item of each category and every 6th after → 2-col span
              const wide = idx === 0 || idx % 6 === 5;
              return (
                <div
                  key={item.id}
                  style={{ gridColumn: wide ? "span 2" : "span 1" }}
                >
                  <ItemCard
                    item={item}
                    effect={cardEffect as CardEffect}
                    hoveredCardId={hoveredCardId}
                    mx={mousePos.mx}
                    my={mousePos.my}
                    onCardEnter={onCardEnter}
                    onCardLeave={onCardLeave}
                    onCardMove={onCardMove}
                    onAdd={onItemAdd}
                  />
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
