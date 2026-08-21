"use client";

import { useState, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { IconPlus } from "@tabler/icons-react";
import type { MenuTemplateProps } from "./types";
import type { PublicMenuCategory, PublicMenuItem } from "../page";
import { EmptyMenu } from "./shared/EmptyMenu";
import { fmtPrice } from "./shared/format";
import { getCategoryIcon } from "@/lib/categoryIcons";

/**
 * Polaroid (#26) — 2-column grid of "instant photo" cards.
 * Each card: thick white frame (more padding at bottom, like a real Polaroid),
 * a small deterministic tilt, item name + price below the frame.
 * Rotation is index-based so it never jumps on re-render.
 *
 * Custom card — calls onItemAdd, handles sold-out, uses gallery-photo fix.
 */

// Deterministic tilt per visual position — cycles every 8 items.
const TILTS = [-3.5, 2, -2, 3, 1.5, -4, 2.5, -1.5];

function PolaroidCard({
  item,
  tiltDeg,
  onItemAdd,
}: {
  item: PublicMenuItem;
  tiltDeg: number;
  onItemAdd: (item: PublicMenuItem) => void;
}) {
  const t = useTranslations("menu");
  const soldOut = item.stock_count !== null && item.stock_count === 0;
  const hasOptions = item.groups.length > 0;

  const [justAdded, setJustAdded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleAdd = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (soldOut) return;
      onItemAdd(item);
      if (!hasOptions) {
        setJustAdded(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setJustAdded(false), 1000);
      }
    },
    [soldOut, hasOptions, item, onItemAdd]
  );

  // Gallery-first photo fix (mirrors ItemCard/HeroCard logic)
  const galleryUrl = item.photos.find((p) => p.url && p.url.trim() !== "")?.url;
  const primaryUrl =
    galleryUrl ?? (item.photo_url && item.photo_url.trim() !== "" ? item.photo_url : undefined);

  return (
    <div
      onClick={soldOut ? undefined : () => onItemAdd(item)}
      style={{
        cursor: soldOut ? "default" : "pointer",
        transform: `rotate(${tiltDeg}deg)`,
        transition: "transform .2s ease",
        // Give room so rotated corners don't clip siblings
        margin: "4px 2px 12px",
      }}
    >
      {/* Polaroid frame */}
      <div
        style={{
          background: "#fff",
          // Thick equal padding on 3 sides, much more at bottom (Polaroid style)
          padding: "10px 10px 30px",
          borderRadius: 3,
          boxShadow: "0 4px 16px rgba(0,0,0,0.22), 0 1px 4px rgba(0,0,0,0.12)",
          position: "relative",
        }}
      >
        {/* Photo area — 1:1 aspect ratio */}
        <div
          style={{
            position: "relative",
            paddingBottom: "100%",
            background: "#e8e8e8",
            overflow: "hidden",
          }}
        >
          {primaryUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={primaryUrl}
              alt={item.name}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
          ) : (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 40,
                background: "#e8e8e8",
              }}
            >
              🍽️
            </div>
          )}

          {/* Sold-out overlay */}
          {soldOut && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(0,0,0,0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                style={{
                  background: "var(--color-danger)",
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 700,
                  borderRadius: 6,
                  padding: "3px 8px",
                }}
              >
                {t("soldOut")}
              </span>
            </div>
          )}
        </div>

        {/* Caption area inside the frame (below photo, above bottom margin) */}
        <div
          style={{
            marginTop: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 4,
            minHeight: 28,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                color: "#222",
                lineHeight: 1.3,
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                // Slightly casual feel
                letterSpacing: "0.01em",
              }}
            >
              {item.name}
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: soldOut ? "#999" : "#D97706",
                marginTop: 2,
              }}
            >
              {soldOut ? t("soldOut") : fmtPrice(item.price_cents)}
            </div>
          </div>

          {!soldOut && (
            <button
              type="button"
              onClick={handleAdd}
              aria-label={hasOptions ? t("customizeAria") : t("addToCartAria")}
              style={{
                width: 26,
                height: 26,
                borderRadius: "50%",
                background: justAdded ? "#059669" : "var(--color-brand)",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                cursor: "pointer",
                flexShrink: 0,
                padding: 0,
                transform: justAdded ? "scale(1.12)" : "scale(1)",
                transition:
                  "transform .18s cubic-bezier(.22,1,.36,1), background .2s ease",
              }}
            >
              {justAdded ? (
                <span style={{ fontSize: 12, fontWeight: 700 }}>✓</span>
              ) : (
                <IconPlus size={14} />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryHeader({ category }: { category: PublicMenuCategory }) {
  const TablerIcon = getCategoryIcon(category.icon);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "20px 0 10px",
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
          fontSize: 16,
          fontWeight: 700,
          color: "var(--text-primary)",
          margin: 0,
        }}
      >
        {category.name}
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
        {category.items.length}
      </span>
    </div>
  );
}

export default function Polaroid({
  business,
  categories,
  sectionRefs,
  onItemAdd,
}: MenuTemplateProps) {
  const nonEmpty = categories.filter((c) => c.items.length > 0);
  if (nonEmpty.length === 0) return <EmptyMenu bizName={business.name} />;

  // Global index for tilt cycling across all categories
  let globalIdx = 0;

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 16px 32px" }}>
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
          <CategoryHeader category={cat} />

          {/* 2-column Polaroid grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 4,
              // Extra horizontal padding so rotated corners have breathing room
              padding: "0 8px",
            }}
          >
            {cat.items.map((item) => {
              const tiltDeg = TILTS[globalIdx % TILTS.length];
              globalIdx++;
              return (
                <PolaroidCard
                  key={item.id}
                  item={item}
                  tiltDeg={tiltDeg}
                  onItemAdd={onItemAdd}
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
