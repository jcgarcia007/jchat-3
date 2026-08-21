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
 * SplitDiagonal (#25) — each item is a wide band where the photo occupies one
 * side clipped in a diagonal, and the name/price/add fills the other side.
 * The photo side alternates left ↔ right per item to give rhythm.
 *
 * Custom card layout (clip-path doesn't compose well with ItemCard's flex
 * column structure), but onItemAdd / sold-out / gallery-photo-fix are all
 * handled correctly here.
 */

const CARD_H = 148; // px — height of each band

function SplitCard({
  item,
  photoLeft,
  onItemAdd,
}: {
  item: PublicMenuItem;
  photoLeft: boolean;
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

  // Diagonal clip: photo side extends a bit past 50% with an angled edge.
  // photoLeft → photo clips from left, info on right; reversed otherwise.
  const photoClip = photoLeft
    ? "polygon(0 0, 100% 0, 82% 100%, 0 100%)"
    : "polygon(18% 0, 100% 0, 100% 100%, 0 100%)";

  return (
    <div
      onClick={soldOut ? undefined : () => onItemAdd(item)}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: photoLeft ? "row" : "row-reverse",
        height: CARD_H,
        borderRadius: 14,
        overflow: "hidden",
        cursor: soldOut ? "default" : "pointer",
        opacity: soldOut ? 0.65 : 1,
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
      }}
    >
      {/* ── Photo side ──────────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          // The photo always fills the full card; clip cuts a diagonal wedge
          // so only ~58% is visible on the photo side.
          clipPath: photoLeft
            ? "polygon(0 0, 60% 0, 45% 100%, 0 100%)"
            : "polygon(55% 0, 100% 0, 100% 100%, 40% 100%)",
          zIndex: 1,
        }}
      >
        {primaryUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={primaryUrl}
            alt={item.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              background:
                "linear-gradient(135deg, var(--bg-elevated) 0%, var(--bg-surface) 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 40,
            }}
          >
            🍽️
          </div>
        )}
      </div>

      {/* ── Info side ───────────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          // Info panel covers the non-photo half (with some overlap for the diagonal)
          left: photoLeft ? "42%" : 0,
          right: photoLeft ? 0 : "42%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: photoLeft ? "12px 16px 12px 20px" : "12px 20px 12px 16px",
          zIndex: 2,
          background: "var(--bg-surface)",
          // Slight gradient toward the photo side to blend the diagonal
          backgroundImage: photoLeft
            ? "linear-gradient(to right, transparent 0%, var(--bg-surface) 18%)"
            : "linear-gradient(to left, transparent 0%, var(--bg-surface) 18%)",
        }}
      >
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 700,
            color: "var(--text-primary)",
            lineHeight: 1.3,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            marginBottom: 4,
          }}
        >
          {item.name}
        </div>

        {item.description && (
          <div
            style={{
              fontSize: 11,
              color: "var(--text-tertiary)",
              lineHeight: 1.4,
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
              marginBottom: 8,
            }}
          >
            {item.description}
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            marginTop: "auto",
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 800,
              color: soldOut ? "var(--text-tertiary)" : "var(--color-gold)",
            }}
          >
            {soldOut ? t("soldOut") : fmtPrice(item.price_cents)}
          </span>

          {!soldOut && (
            <button
              type="button"
              onClick={handleAdd}
              aria-label={hasOptions ? t("customizeAria") : t("addToCartAria")}
              style={{
                width: 30,
                height: 30,
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
                <span style={{ fontSize: 14, fontWeight: 700 }}>✓</span>
              ) : (
                <IconPlus size={16} />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Sold-out overlay */}
      {soldOut && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
          }}
        >
          <span
            style={{
              background: "var(--color-danger)",
              color: "#fff",
              fontSize: 11,
              fontWeight: 700,
              borderRadius: 8,
              padding: "4px 10px",
            }}
          >
            {t("soldOut")}
          </span>
        </div>
      )}
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

export default function SplitDiagonal({
  business,
  categories,
  sectionRefs,
  onItemAdd,
}: MenuTemplateProps) {
  const nonEmpty = categories.filter((c) => c.items.length > 0);
  if (nonEmpty.length === 0) return <EmptyMenu bizName={business.name} />;

  // Global item index across all categories for alternating left/right
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

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {cat.items.map((item) => {
              const photoLeft = globalIdx % 2 === 0;
              globalIdx++;
              return (
                <SplitCard
                  key={item.id}
                  item={item}
                  photoLeft={photoLeft}
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
