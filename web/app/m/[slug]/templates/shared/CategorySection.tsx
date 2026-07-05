"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { IconPlus } from "@tabler/icons-react";
import { getCategoryIcon } from "@/lib/categoryIcons";
import { buildEffectStyles, type CardEffect } from "./effects";
import { fmtPrice } from "./format";
import type { PublicMenuCategory, PublicMenuItem } from "../../page";

// Item-card rendering system — moved verbatim from MenuPageClient.
// Reused by every category-based template.

export const BADGE_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  best_seller: { label: "⭐ Más vendido", bg: "#D97706", color: "#fff" },
  new: { label: "✨ Nuevo", bg: "#059669", color: "#fff" },
  hot: { label: "🌶️ Hot", bg: "#DC2626", color: "#fff" },
};

export const DIETARY_LABELS: Record<string, string> = {
  vegetarian: "🌱 Vegetal",
  vegan: "🌿 Vegano",
  gluten_free: "🌾 Sin gluten",
  seafood: "🦐 Mariscos",
  spicy: "🌶️ Picante",
  nut_free: "🥜 Sin nueces",
  dairy_free: "🥛 Sin lácteos",
};

function AddButton({
  hasOptions,
  justAdded,
  onClick,
  floating,
}: {
  hasOptions: boolean;
  justAdded: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  floating?: boolean;
}) {
  const label = justAdded ? "✓" : <IconPlus size={18} />;
  const bg = justAdded ? "#059669" : "var(--color-brand)";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={hasOptions ? "Personalizar" : "Agregar al carrito"}
      style={{
        width: 30,
        height: 30,
        borderRadius: "50%",
        background: bg,
        border: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 17,
        color: "#fff",
        fontWeight: 700,
        flexShrink: 0,
        cursor: "pointer",
        lineHeight: 1,
        padding: 0,
        boxShadow: floating ? "0 4px 12px rgba(0,0,0,0.45)" : "none",
        transform: justAdded ? "scale(1.12)" : "scale(1)",
        transition:
          "transform .18s cubic-bezier(.22,1,.36,1), background .2s ease",
      }}
    >
      {label}
    </button>
  );
}

export function ItemCard({
  item,
  effect,
  hoveredCardId,
  mx,
  my,
  onCardEnter,
  onCardLeave,
  onCardMove,
  onAdd,
}: {
  item: PublicMenuItem;
  effect: CardEffect;
  hoveredCardId: string | null;
  mx: number;
  my: number;
  onCardEnter: (e: React.MouseEvent<HTMLDivElement>, id: string) => void;
  onCardLeave: () => void;
  onCardMove: (e: React.MouseEvent<HTMLDivElement>, id: string) => void;
  onAdd: (item: PublicMenuItem) => void;
}) {
  const soldOut = item.stock_count !== null && item.stock_count === 0;
  const hasOptions = item.groups.length > 0;
  const badge = item.badge ? BADGE_CONFIG[item.badge] : null;

  const cardId = `${item.category_id}/${item.id}`;
  const isHovered = !soldOut && hoveredCardId === cardId;

  const [justAdded, setJustAdded] = useState(false);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (addedTimer.current) clearTimeout(addedTimer.current); }, []);

  const handleAddClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (soldOut) return;
      onAdd(item);
      if (!hasOptions) {
        setJustAdded(true);
        if (addedTimer.current) clearTimeout(addedTimer.current);
        addedTimer.current = setTimeout(() => setJustAdded(false), 1000);
      }
    },
    [soldOut, hasOptions, item, onAdd]
  );

  const {
    cardStyle,
    photoWrapStyle,
    imgStyle,
    overlayStyle,
    revealInfo,
    belowInfo,
    revealWrapStyle,
    revealDescStyle,
  } = buildEffectStyles(effect, isHovered, mx, my);

  const primaryUrl = item.photos[0]?.url ?? item.photo_url;

  return (
    <div
      onMouseEnter={soldOut ? undefined : (e) => onCardEnter(e, cardId)}
      onMouseLeave={soldOut ? undefined : onCardLeave}
      onMouseMove={soldOut ? undefined : (e) => onCardMove(e, cardId)}
      onClick={soldOut ? undefined : () => onAdd(item)}
      style={{
        ...cardStyle,
        cursor: soldOut ? "default" : "pointer",
        opacity: soldOut ? 0.65 : 1,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Photo area */}
      <div style={{ ...photoWrapStyle, flexShrink: 0 }}>
        {/* Image or placeholder */}
        {primaryUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={primaryUrl} alt="" style={imgStyle} />
        ) : (
          <div
            style={{
              ...imgStyle,
              background:
                "linear-gradient(135deg, var(--bg-elevated) 0%, var(--bg-surface) 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 36,
            }}
          >
            🍽️
          </div>
        )}

        {/* Effect overlay */}
        <div style={overlayStyle} />

        {/* +N photos badge */}
        {item.photos.length > 1 && (
          <div
            style={{
              position: "absolute",
              bottom: 8,
              right: 8,
              background: "rgba(0,0,0,0.65)",
              color: "#fff",
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 10,
              padding: "2px 7px",
              zIndex: 4,
            }}
          >
            +{item.photos.length - 1}
          </div>
        )}

        {/* Badge */}
        {badge && (
          <div
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              background: badge.bg,
              color: badge.color,
              fontSize: 10,
              fontWeight: 700,
              borderRadius: 8,
              padding: "3px 7px",
              zIndex: 4,
            }}
          >
            {badge.label}
          </div>
        )}

        {/* Floating + button for reveal/glass effects (info inside photo, no below area) */}
        {!belowInfo && !soldOut && (
          <div style={{ position: "absolute", top: 8, right: 8, zIndex: 6 }}>
            <AddButton
              hasOptions={hasOptions}
              justAdded={justAdded}
              onClick={handleAddClick}
              floating
            />
          </div>
        )}

        {/* Sold-out overlay */}
        {soldOut && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.55)",
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
                fontSize: 11,
                fontWeight: 700,
                borderRadius: 8,
                padding: "4px 10px",
              }}
            >
              Agotado
            </span>
          </div>
        )}

        {/* Reveal / Glass info panel (inside photo) */}
        {revealInfo && (
          <div style={revealWrapStyle}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{item.name}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#E3B765" }}>
              {fmtPrice(item.price_cents)}
            </div>
            {item.description && (
              <div style={revealDescStyle}>{item.description}</div>
            )}
          </div>
        )}
      </div>

      {/* Below-photo content (all effects except reveal/glass) */}
      {belowInfo && (
        <div
          style={{
            padding: "10px 12px 12px",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-primary)",
              lineHeight: 1.3,
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
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              }}
            >
              {item.description}
            </div>
          )}

          {item.dietary_tags.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {item.dietary_tags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  style={{
                    fontSize: 9,
                    color: "var(--text-tertiary)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 6,
                    padding: "1px 5px",
                  }}
                >
                  {DIETARY_LABELS[tag] ?? tag}
                </span>
              ))}
            </div>
          )}

          <div
            style={{
              marginTop: "auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingTop: 4,
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--color-gold)" }}>
              {fmtPrice(item.price_cents)}
            </span>
            {!soldOut && (
              <AddButton
                hasOptions={hasOptions}
                justAdded={justAdded}
                onClick={handleAddClick}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function CategorySection({
  category,
  sectionRef,
  effect,
  hoveredCardId,
  mx,
  my,
  onCardEnter,
  onCardLeave,
  onCardMove,
  onItemAdd,
}: {
  category: PublicMenuCategory;
  sectionRef: (el: HTMLElement | null) => void;
  effect: CardEffect;
  hoveredCardId: string | null;
  mx: number;
  my: number;
  onCardEnter: (e: React.MouseEvent<HTMLDivElement>, id: string) => void;
  onCardLeave: () => void;
  onCardMove: (e: React.MouseEvent<HTMLDivElement>, id: string) => void;
  onItemAdd: (item: PublicMenuItem) => void;
}) {
  if (category.items.length === 0) return null;

  return (
    <section
      id={`cat-${category.id}`}
      ref={sectionRef}
      style={{ scrollMarginTop: 56 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "20px 16px 12px",
          maxWidth: 680,
          margin: "0 auto",
        }}
      >
        {category.icon_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={category.icon_url}
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
          const TablerIcon = getCategoryIcon(category.icon);
          if (TablerIcon) return <TablerIcon size={22} stroke={1.5} color="var(--color-gold)" />;
          if (category.icon) return <span style={{ fontSize: 20 }}>{category.icon}</span>;
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

      <div
        style={{
          maxWidth: 680,
          margin: "0 auto",
          padding: "0 16px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: 12,
        }}
      >
        {category.items.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            effect={effect}
            hoveredCardId={hoveredCardId}
            mx={mx}
            my={my}
            onCardEnter={onCardEnter}
            onCardLeave={onCardLeave}
            onCardMove={onCardMove}
            onAdd={onItemAdd}
          />
        ))}
      </div>
    </section>
  );
}
