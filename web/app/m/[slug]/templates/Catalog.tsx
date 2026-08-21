"use client";

import { useState } from "react";
import type { MenuTemplateProps } from "./types";
import type { CardEffect } from "./shared/effects";
import type { PublicMenuCategory } from "../page";
import { ItemCard } from "./shared/CategorySection";
import { EmptyMenu } from "./shared/EmptyMenu";
import { getCategoryIcon } from "@/lib/categoryIcons";

/**
 * Catalog (#27) — online-store style layout.
 *
 * A sticky row of category chips ("Todos" + one per category) lets the user
 * jump to any section or filter by tapping. Tapping calls scrollToCategory
 * (parent helper) which drives the smooth scroll and scroll-spy state.
 *
 * Items are laid out in a 2-3 column product grid using ItemCard, which
 * inherits all cart / customizer / sold-out / effect logic.
 */
export default function Catalog({
  business,
  categories,
  activeCategory,
  scrollToCategory,
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

  const activeCatId = activeCategory || nonEmpty[0]?.id || "";

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      {/* ── Sticky filter chips ──────────────────────────────────────── */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "var(--bg-base)",
          borderBottom: "1px solid var(--border-subtle)",
          padding: "10px 16px",
          display: "flex",
          gap: 8,
          overflowX: "auto",
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {/* "Todos" chip — scrolls to first category */}
        <CategoryChip
          label="Todos"
          active={false}
          onClick={() => scrollToCategory(nonEmpty[0]?.id ?? "")}
        />

        {nonEmpty.map((cat) => (
          <CategoryChip
            key={cat.id}
            label={cat.name}
            icon={cat.icon ?? undefined}
            iconUrl={cat.icon_url ?? undefined}
            active={cat.id === activeCatId}
            onClick={() => scrollToCategory(cat.id)}
          />
        ))}
      </div>

      {/* ── Product grid per category ────────────────────────────────── */}
      <div style={{ padding: "8px 16px 32px" }}>
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
            <CatalogCategoryHeader category={cat} />

            {/* Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                gap: 12,
                marginBottom: 24,
              }}
            >
              {cat.items.map((item) => (
                <ItemCard
                  key={item.id}
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
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/* ── Chip ─────────────────────────────────────────────────────────────────── */

function CategoryChip({
  label,
  icon,
  iconUrl,
  active,
  onClick,
}: {
  label: string;
  icon?: string;
  iconUrl?: string;
  active: boolean;
  onClick: () => void;
}) {
  const TablerIcon = getCategoryIcon(icon);
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "5px 13px",
        borderRadius: 999,
        border: active
          ? "1.5px solid var(--color-brand)"
          : "1px solid var(--border-subtle)",
        background: active ? "var(--color-brand-light, rgba(92,124,250,0.12))" : "var(--bg-surface)",
        color: active ? "var(--color-brand)" : "var(--text-secondary)",
        fontSize: 12,
        fontWeight: active ? 700 : 500,
        cursor: "pointer",
        whiteSpace: "nowrap",
        flexShrink: 0,
        transition: "border-color .15s, background .15s, color .15s",
      }}
    >
      {iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={iconUrl}
          alt=""
          style={{ width: 14, height: 14, borderRadius: "50%", objectFit: "cover" }}
        />
      ) : TablerIcon ? (
        <TablerIcon size={13} stroke={active ? 2 : 1.5} style={{ color: "currentColor" }} />
      ) : icon ? (
        <span style={{ fontSize: 12 }}>{icon}</span>
      ) : null}
      {label}
    </button>
  );
}

/* ── Category header ──────────────────────────────────────────────────────── */

function CatalogCategoryHeader({ category }: { category: PublicMenuCategory }) {
  const TablerIcon = getCategoryIcon(category.icon);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "20px 0 10px",
        borderBottom: "1px solid var(--border-subtle)",
        marginBottom: 12,
      }}
    >
      {category.icon_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={category.icon_url}
          alt=""
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            objectFit: "cover",
            flexShrink: 0,
            border: "1.5px solid rgba(217,119,6,0.5)",
          }}
        />
      ) : TablerIcon ? (
        <TablerIcon size={20} stroke={1.5} color="var(--color-gold)" />
      ) : category.icon ? (
        <span style={{ fontSize: 18 }}>{category.icon}</span>
      ) : null}
      <h2
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: "var(--text-primary)",
          margin: 0,
        }}
      >
        {category.name}
      </h2>
      <span
        style={{
          fontSize: 10,
          color: "var(--text-tertiary)",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 10,
          padding: "1px 6px",
          marginLeft: 2,
        }}
      >
        {category.items.length}
      </span>
    </div>
  );
}
