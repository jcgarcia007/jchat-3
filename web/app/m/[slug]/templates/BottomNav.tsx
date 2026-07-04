"use client";

import { useEffect, useRef } from "react";
import { getCategoryIcon } from "@/lib/categoryIcons";
import type { PublicMenuCategory } from "../page";
import type { MenuTemplateProps } from "./types";
import type { CardEffect } from "./shared/effects";
import { CategorySection } from "./shared/CategorySection";
import { EmptyMenu } from "./shared/EmptyMenu";

// CategoryNav — sticky top chips. Bottom-nav specific (moved verbatim).
function CategoryNav({
  categories,
  activeId,
  onSelect,
}: {
  categories: PublicMenuCategory[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current?.querySelector<HTMLButtonElement>(
      `[data-cat="${activeId}"]`
    );
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeId]);

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: "var(--bg-base)",
        borderBottom: "1px solid var(--border-subtle)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
      }}
    >
      <div
        ref={scrollRef}
        style={{
          display: "flex",
          gap: 8,
          overflowX: "auto",
          padding: "10px 16px",
          scrollbarWidth: "none",
          maxWidth: 680,
          margin: "0 auto",
        }}
      >
        {categories.map((cat) => {
          const active = cat.id === activeId;
          return (
            <button
              key={cat.id}
              data-cat={cat.id}
              onClick={() => onSelect(cat.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "6px 14px",
                borderRadius: 20,
                border: active
                  ? "1px solid var(--color-gold)"
                  : "1px solid var(--border-subtle)",
                background: active ? "rgba(217,119,6,0.15)" : "var(--bg-surface)",
                color: active ? "var(--color-gold)" : "var(--text-secondary)",
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
                transition: "all 0.15s",
              }}
            >
              {cat.icon_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cat.icon_url}
                  alt=""
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    objectFit: "cover",
                    flexShrink: 0,
                    border: "1px solid rgba(217,119,6,0.4)",
                  }}
                />
              ) : (() => {
                const TablerIcon = getCategoryIcon(cat.icon);
                if (TablerIcon) return <TablerIcon size={16} stroke={1.5} style={{ flexShrink: 0, color: "currentColor" }} />;
                if (cat.icon) return <span style={{ fontSize: 15 }}>{cat.icon}</span>;
                return null;
              })()}
              {cat.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * BottomNav — the default template. Renders exactly the original menu body:
 * sticky category chips + category sections of item cards. Zero visual change.
 */
export default function BottomNav({
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
  return (
    <>
      {categories.length > 0 && (
        <CategoryNav
          categories={categories}
          activeId={activeCategory}
          onSelect={scrollToCategory}
        />
      )}

      {categories.length === 0 ? (
        <EmptyMenu bizName={business.name} />
      ) : (
        <div style={{ paddingBottom: 24 }}>
          {categories.map((cat) => (
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
          ))}
        </div>
      )}
    </>
  );
}
