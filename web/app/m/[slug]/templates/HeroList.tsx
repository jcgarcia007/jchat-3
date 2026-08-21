"use client";

import { useState, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { IconPlus } from "@tabler/icons-react";
import type { MenuTemplateProps } from "./types";
import type { PublicMenuCategory, PublicMenuItem } from "../page";
import { DenseRow } from "./shared/DenseRow";
import { EmptyMenu } from "./shared/EmptyMenu";
import { fmtPrice } from "./shared/format";
import { getCategoryIcon } from "@/lib/categoryIcons";

/**
 * HeroList (#24) — per category: the first item shown as a full-bleed hero
 * (large photo + name/price overlay), the rest as a DenseRow compact list.
 * Every category gets its own "star dish" featured prominently up front.
 *
 * The hero is also clickable for cart (onItemAdd) — carrito is never broken.
 * DenseRow is reused for the list rows to keep sold-out / customizer logic.
 */

/** Full-width hero card for the first item of each category. */
function HeroCard({
  item,
  onItemAdd,
}: {
  item: PublicMenuItem;
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

  // First non-empty gallery URL, then photo_url — mirrors ItemCard logic
  const galleryUrl = item.photos.find((p) => p.url && p.url.trim() !== "")?.url;
  const primaryUrl =
    galleryUrl ?? (item.photo_url && item.photo_url.trim() !== "" ? item.photo_url : undefined);

  return (
    <div
      onClick={soldOut ? undefined : () => onItemAdd(item)}
      style={{
        position: "relative",
        width: "100%",
        height: 280,
        borderRadius: 18,
        overflow: "hidden",
        cursor: soldOut ? "default" : "pointer",
        marginBottom: 10,
        flexShrink: 0,
      }}
    >
      {/* Photo or placeholder */}
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
          }}
        />
      ) : (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(135deg, var(--bg-elevated) 0%, var(--bg-surface) 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 56,
          }}
        >
          🍽️
        </div>
      )}

      {/* Bottom gradient for text legibility */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.22) 50%, transparent 100%)",
        }}
      />

      {/* Sold-out overlay */}
      {soldOut && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.50)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 5,
          }}
        >
          <span
            style={{
              background: "var(--color-danger)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              borderRadius: 8,
              padding: "6px 14px",
            }}
          >
            {t("soldOut")}
          </span>
        </div>
      )}

      {/* Name / price + add button */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "16px 16px 14px",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 12,
          zIndex: 4,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 19,
              fontWeight: 700,
              color: "#fff",
              lineHeight: 1.25,
              textShadow: "0 1px 4px rgba(0,0,0,0.5)",
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {item.name}
          </div>
          {!soldOut && (
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "#E3B765",
                marginTop: 4,
                textShadow: "0 1px 3px rgba(0,0,0,0.4)",
              }}
            >
              {fmtPrice(item.price_cents)}
            </div>
          )}
        </div>

        {!soldOut && (
          <button
            type="button"
            onClick={handleAdd}
            aria-label={hasOptions ? t("customizeAria") : t("addToCartAria")}
            style={{
              flexShrink: 0,
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: justAdded ? "#059669" : "var(--color-brand)",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 21,
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(0,0,0,0.45)",
              transform: justAdded ? "scale(1.12)" : "scale(1)",
              transition:
                "transform .18s cubic-bezier(.22,1,.36,1), background .2s ease",
            }}
          >
            {justAdded ? "✓" : <IconPlus size={20} />}
          </button>
        )}
      </div>
    </div>
  );
}

export default function HeroList({
  business,
  categories,
  sectionRefs,
  onItemAdd,
}: MenuTemplateProps) {
  const nonEmpty = categories.filter((c) => c.items.length > 0);
  if (nonEmpty.length === 0) return <EmptyMenu bizName={business.name} />;

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 16px 32px" }}>
      {nonEmpty.map((cat: PublicMenuCategory) => {
        const [hero, ...rest] = cat.items;
        return (
          <section
            key={cat.id}
            id={`cat-${cat.id}`}
            ref={(el) => {
              if (el) sectionRefs.current.set(cat.id, el);
              else sectionRefs.current.delete(cat.id);
            }}
            style={{ scrollMarginTop: 56, marginBottom: 28 }}
          >
            {/* Category header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "14px 0 10px",
              }}
            >
              {cat.icon_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cat.icon_url}
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
              ) : (() => {
                const TablerIcon = getCategoryIcon(cat.icon);
                if (TablerIcon)
                  return <TablerIcon size={20} stroke={1.5} color="var(--color-gold)" />;
                if (cat.icon)
                  return <span style={{ fontSize: 18 }}>{cat.icon}</span>;
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
            </div>

            {/* Hero — star dish */}
            <HeroCard item={hero} onItemAdd={onItemAdd} />

            {/* Compact list for remaining items */}
            {rest.length > 0 && (
              <div
                style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}
              >
                {rest.map((item) => (
                  <DenseRow key={item.id} item={item} onItemAdd={onItemAdd} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
