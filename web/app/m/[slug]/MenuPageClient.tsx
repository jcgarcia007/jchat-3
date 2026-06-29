"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getCategoryIcon } from "@/lib/categoryIcons";
import type {
  PublicBusiness,
  PublicMenuCategory,
  PublicMenuItem,
  MenuItemOption,
  ModifierGroup,
  ModifierChoice,
} from "./page";

// ── Card effect types ─────────────────────────────────────────────────────────

export type CardEffect =
  | "lift"
  | "reveal"
  | "tilt"
  | "spotlight"
  | "duotone"
  | "glass"
  | "shine"
  | "focus"
  | "neon"
  | "polaroid";

type EffectStyles = {
  cardStyle: React.CSSProperties;
  photoWrapStyle: React.CSSProperties;
  imgStyle: React.CSSProperties;
  overlayStyle: React.CSSProperties;
  revealInfo: boolean;
  belowInfo: boolean;
  revealWrapStyle: React.CSSProperties;
  revealDescStyle: React.CSSProperties;
};

// Translated directly from Galeria Efectos.dc.html cardFor() function
function buildEffectStyles(
  eff: CardEffect,
  h: boolean,
  mx: number,
  my: number
): EffectStyles {
  let cardStyle: React.CSSProperties = {
    position: "relative",
    background: "rgba(255,255,255,0.045)",
    border: "0.5px solid rgba(255,255,255,0.09)",
    borderRadius: 16,
    overflow: "hidden",
    cursor: "pointer",
  };
  let photoWrapStyle: React.CSSProperties = {
    position: "relative",
    aspectRatio: "16 / 10",
    overflow: "hidden",
  };
  let imgStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    transformOrigin: "center",
    transition: "transform .5s ease, filter .5s ease",
    zIndex: 1,
  };
  let overlayStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    zIndex: 2,
    opacity: 0,
    transition: "opacity .35s ease",
  };
  let revealInfo = false;
  let belowInfo = true;
  let revealWrapStyle: React.CSSProperties = {};
  let revealDescStyle: React.CSSProperties = {};

  if (eff === "lift") {
    cardStyle = {
      ...cardStyle,
      transition: "transform .3s cubic-bezier(.22,1,.36,1), box-shadow .3s ease",
      transform: h ? "translateY(-10px)" : "none",
      boxShadow: h ? "0 22px 46px rgba(0,0,0,0.5)" : "0 1px 3px rgba(0,0,0,0.25)",
    };
    imgStyle = { ...imgStyle, transform: h ? "scale(1.1)" : "scale(1)" };
  } else if (eff === "reveal") {
    belowInfo = false;
    revealInfo = true;
    photoWrapStyle = { ...photoWrapStyle, aspectRatio: "3 / 4" };
    cardStyle = {
      ...cardStyle,
      transition: "box-shadow .3s ease",
      boxShadow: h ? "0 22px 46px rgba(0,0,0,0.5)" : "0 1px 3px rgba(0,0,0,0.25)",
    };
    imgStyle = { ...imgStyle, transform: h ? "scale(1.06)" : "scale(1)" };
    overlayStyle = {
      ...overlayStyle,
      background: "linear-gradient(to top, rgba(8,13,30,0.96) 2%, rgba(8,13,30,0.45) 38%, rgba(8,13,30,0) 72%)",
      opacity: h ? 1 : 0.6,
    };
    revealWrapStyle = {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      padding: 16,
      zIndex: 3,
      color: "#F4F6FB",
      display: "flex",
      flexDirection: "column",
      gap: 8,
      transform: h ? "translateY(0)" : "translateY(10px)",
      transition: "transform .35s ease",
    };
    revealDescStyle = {
      fontSize: 12.5,
      color: "rgba(244,246,251,0.8)",
      lineHeight: 1.4,
      overflow: "hidden",
      maxHeight: h ? 60 : 0,
      opacity: h ? 1 : 0,
      transition: "all .35s ease",
    };
  } else if (eff === "tilt") {
    cardStyle = {
      ...cardStyle,
      transition: h
        ? "transform .06s linear, box-shadow .3s ease"
        : "transform .45s ease, box-shadow .3s ease",
      transform: `perspective(720px) rotateX(${(-(my - 0.5) * 14).toFixed(2)}deg) rotateY(${((mx - 0.5) * 16).toFixed(2)}deg) scale(${h ? 1.03 : 1})`,
      transformStyle: "preserve-3d",
      boxShadow: h ? "0 24px 50px rgba(0,0,0,0.55)" : "0 1px 3px rgba(0,0,0,0.25)",
    };
    imgStyle = { ...imgStyle, transform: h ? "scale(1.05)" : "scale(1)" };
    overlayStyle = {
      ...overlayStyle,
      background: `radial-gradient(circle at ${(mx * 100).toFixed(1)}% ${(my * 100).toFixed(1)}%, rgba(255,255,255,0.30), rgba(255,255,255,0) 45%)`,
      opacity: h ? 1 : 0,
      transition: "opacity .2s ease",
    };
  } else if (eff === "spotlight") {
    cardStyle = {
      ...cardStyle,
      transition: "box-shadow .3s ease, border-color .3s ease",
      border: "0.5px solid " + (h ? "rgba(227,183,101,0.6)" : "rgba(255,255,255,0.09)"),
      boxShadow: h
        ? "0 0 0 1px rgba(227,183,101,0.4), 0 16px 44px rgba(227,183,101,0.18)"
        : "0 1px 3px rgba(0,0,0,0.25)",
    };
    overlayStyle = {
      ...overlayStyle,
      background: `radial-gradient(240px circle at ${(mx * 100).toFixed(1)}% ${(my * 100).toFixed(1)}%, rgba(227,183,101,0.34), rgba(227,183,101,0) 60%)`,
      opacity: h ? 1 : 0,
      transition: "opacity .2s ease",
    };
  } else if (eff === "duotone") {
    cardStyle = {
      ...cardStyle,
      transition: "box-shadow .3s ease",
      boxShadow: h ? "0 18px 42px rgba(0,0,0,0.45)" : "0 1px 3px rgba(0,0,0,0.25)",
    };
    imgStyle = {
      ...imgStyle,
      filter: h ? "none" : "grayscale(0.9) contrast(1.05) brightness(0.82)",
      transform: h ? "scale(1.06)" : "scale(1)",
    };
    overlayStyle = {
      ...overlayStyle,
      background: "linear-gradient(135deg,#378ADD,#534AB7)",
      mixBlendMode: "color",
      opacity: h ? 0 : 0.55,
      transition: "opacity .5s ease",
    };
  } else if (eff === "glass") {
    belowInfo = false;
    revealInfo = true;
    cardStyle = {
      ...cardStyle,
      transition: "box-shadow .3s ease, transform .3s ease",
      transform: h ? "translateY(-6px)" : "none",
      boxShadow: h ? "0 22px 46px rgba(0,0,0,0.5)" : "0 1px 3px rgba(0,0,0,0.25)",
    };
    imgStyle = { ...imgStyle, transform: h ? "scale(1.08)" : "scale(1)" };
    overlayStyle = {
      ...overlayStyle,
      background: "linear-gradient(to top, rgba(8,13,30,0.5), rgba(8,13,30,0))",
      opacity: h ? 1 : 0.4,
    };
    revealWrapStyle = {
      position: "absolute",
      left: 12,
      right: 12,
      bottom: 12,
      padding: "12px 14px",
      zIndex: 3,
      color: "#F4F6FB",
      display: "flex",
      flexDirection: "column",
      gap: 6,
      borderRadius: 14,
      background: "rgba(16,26,58,0.55)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      border: "0.5px solid rgba(255,255,255,0.18)",
      boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
      transform: h ? "translateY(0)" : "translateY(8px)",
      transition: "transform .35s ease",
    };
    revealDescStyle = {
      fontSize: 12.5,
      color: "rgba(244,246,251,0.82)",
      lineHeight: 1.4,
      overflow: "hidden",
      maxHeight: h ? 60 : 0,
      opacity: h ? 1 : 0,
      transition: "all .35s ease",
    };
  } else if (eff === "shine") {
    cardStyle = {
      ...cardStyle,
      transition: "transform .3s ease, box-shadow .3s ease",
      transform: h ? "translateY(-6px)" : "none",
      boxShadow: h ? "0 20px 44px rgba(0,0,0,0.5)" : "0 1px 3px rgba(0,0,0,0.25)",
    };
    imgStyle = { ...imgStyle, transform: h ? "scale(1.06)" : "scale(1)" };
    overlayStyle = {
      ...overlayStyle,
      background: "linear-gradient(115deg, rgba(255,255,255,0) 35%, rgba(255,255,255,0.55) 50%, rgba(255,255,255,0) 65%)",
      backgroundSize: "250% 100%",
      backgroundRepeat: "no-repeat",
      backgroundPosition: h ? "-40% 0" : "160% 0",
      opacity: h ? 1 : 0,
      transition: h ? "background-position .8s ease, opacity .15s ease" : "opacity .3s ease",
    };
  } else if (eff === "focus") {
    cardStyle = {
      ...cardStyle,
      transition: "box-shadow .3s ease, transform .3s ease",
      transform: h ? "translateY(-6px)" : "none",
      boxShadow: h ? "0 20px 44px rgba(0,0,0,0.5)" : "0 1px 3px rgba(0,0,0,0.25)",
    };
    imgStyle = {
      ...imgStyle,
      filter: h ? "blur(0px) brightness(1)" : "blur(3px) brightness(0.72)",
      transform: h ? "scale(1.06)" : "scale(1.08)",
    };
  } else if (eff === "neon") {
    cardStyle = {
      ...cardStyle,
      transition: "box-shadow .3s ease, transform .3s ease, border-color .3s ease",
      transform: h ? "translateY(-6px)" : "none",
      border: "0.5px solid " + (h ? "rgba(83,74,183,0.9)" : "rgba(255,255,255,0.09)"),
      boxShadow: h
        ? "0 0 0 1.5px rgba(83,74,183,0.9), 0 0 22px rgba(55,138,221,0.55), 0 16px 40px rgba(0,0,0,0.45)"
        : "0 1px 3px rgba(0,0,0,0.25)",
    };
    imgStyle = { ...imgStyle, transform: h ? "scale(1.05)" : "scale(1)" };
    overlayStyle = {
      ...overlayStyle,
      background: "linear-gradient(135deg, rgba(55,138,221,0.25), rgba(83,74,183,0.25))",
      opacity: h ? 1 : 0,
      transition: "opacity .3s ease",
    };
  } else {
    // polaroid
    cardStyle = {
      ...cardStyle,
      transition: "transform .35s cubic-bezier(.22,1,.36,1), box-shadow .3s ease",
      transform: h ? "rotate(0deg) translateY(-8px) scale(1.04)" : "rotate(-2deg)",
      boxShadow: h ? "0 26px 52px rgba(0,0,0,0.55)" : "0 6px 16px rgba(0,0,0,0.35)",
    };
    imgStyle = { ...imgStyle, transform: h ? "scale(1.04)" : "scale(1)" };
  }

  return {
    cardStyle,
    photoWrapStyle,
    imgStyle,
    overlayStyle,
    revealInfo,
    belowInfo,
    revealWrapStyle,
    revealDescStyle,
  };
}

// ── Cart types ────────────────────────────────────────────────────────────────

interface GroupSelection {
  groupId: string;
  groupLabel: string;
  choices: ModifierChoice[];
}

interface CartItem {
  cartId: string;
  itemId: string;
  name: string;
  basePriceCents: number;
  quantity: number;
  /** Legacy compat fields — kept so CartSheet/PickupSheet render unchanged for old items */
  selectedSize: MenuItemOption | null;
  selectedExtras: MenuItemOption[];
  /** New unified selections (one entry per group) */
  groupSelections: GroupSelection[];
  lineTotalCents: number;
  notes?: string;
}

type AppStep = "menu" | "cart" | "pickup" | "success";
type PickupType = "counter" | "table";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function calcLine(
  base: number,
  size: MenuItemOption | null,
  extras: MenuItemOption[],
  qty: number
): number {
  return (base + (size?.price_cents ?? 0) + extras.reduce((s, e) => s + e.price_cents, 0)) * qty;
}

function calcLineFromGroups(base: number, groups: GroupSelection[], qty: number): number {
  const extra = groups.reduce(
    (sum, g) => sum + g.choices.reduce((s, c) => s + c.price_cents, 0),
    0
  );
  return (base + extra) * qty;
}

const BADGE_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  best_seller: { label: "⭐ Más vendido", bg: "#D97706", color: "#fff" },
  new: { label: "✨ Nuevo", bg: "#059669", color: "#fff" },
  hot: { label: "🌶️ Hot", bg: "#DC2626", color: "#fff" },
};

const DIETARY_LABELS: Record<string, string> = {
  vegetarian: "🌱 Vegetal",
  vegan: "🌿 Vegano",
  gluten_free: "🌾 Sin gluten",
  seafood: "🦐 Mariscos",
  spicy: "🌶️ Picante",
  nut_free: "🥜 Sin nueces",
  dairy_free: "🥛 Sin lácteos",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function BusinessHeader({ biz }: { biz: PublicBusiness }) {
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      {/* Cover */}
      <div
        style={{
          width: "100%",
          height: 220,
          background: biz.cover_url
            ? `url(${biz.cover_url}) center/cover no-repeat`
            : "linear-gradient(135deg, var(--color-brand) 0%, var(--color-brand-purple) 100%)",
          position: "relative",
        }}
        role="img"
        aria-label={`Portada de ${biz.name}`}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(10,10,20,0.85) 100%)",
          }}
        />
      </div>

      {/* Identity */}
      <div
        style={{
          maxWidth: 680,
          margin: "0 auto",
          padding: "0 16px",
          display: "flex",
          alignItems: "flex-end",
          gap: 14,
          marginTop: -36,
          position: "relative",
          zIndex: 2,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 18,
            background: "var(--bg-elevated)",
            border: "3px solid var(--bg-base)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 36,
            flexShrink: 0,
            boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
          }}
        >
          {biz.icon_emoji ?? "🍴"}
        </div>
        <div style={{ paddingBottom: 4, minWidth: 0 }}>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: "0 0 4px",
              lineHeight: 1.2,
            }}
          >
            {biz.name}
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ color: "var(--color-gold)", fontSize: 13 }}>★</span>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              {biz.category ?? "Restaurante"}
            </span>
          </div>
        </div>
      </div>

      {biz.description && (
        <div
          style={{
            maxWidth: 680,
            margin: "0 auto",
            padding: "0 16px 12px",
          }}
        >
          <p
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            {biz.description}
          </p>
        </div>
      )}
    </div>
  );
}

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

// ── AddButton ─────────────────────────────────────────────────────────────────

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
  const label = hasOptions ? "⚙" : justAdded ? "✓" : "+";
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

// ── ItemCard with effect support ──────────────────────────────────────────────

function ItemCard({
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

function CategorySection({
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

// ── Customizer Sheet ──────────────────────────────────────────────────────────

function CustomizerSheet({
  item,
  onClose,
  onAddToCart,
}: {
  item: PublicMenuItem;
  onClose: () => void;
  onAddToCart: (
    item: PublicMenuItem,
    size: MenuItemOption | null,
    extras: MenuItemOption[],
    qty: number,
    groupSelections: GroupSelection[],
    notes?: string
  ) => void;
}) {
  // Pre-select defaults: single groups get default index (hielo->2, picante->1, rest->0)
  const [singleSel, setSingleSel] = useState<Record<string, ModifierChoice | null>>(() => {
    const init: Record<string, ModifierChoice | null> = {};
    for (const g of item.groups) {
      if (g.type === "single" && g.choices.length > 0) {
        const key = (g.label + g.id).toLowerCase();
        const isIce = key.includes("hielo") || key.includes("ice");
        const isSpice = key.includes("picante") || key.includes("spice");
        const idx = isIce ? 2 : isSpice ? 1 : 0;
        init[g.id] = g.choices[Math.min(idx, g.choices.length - 1)];
      }
    }
    return init;
  });
  const [multiSel, setMultiSel] = useState<Record<string, Set<string>>>({});
  const [qty, setQty] = useState(1);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [notes, setNotes] = useState("");
  const toggleMulti = useCallback(
    (groupId: string, choice: ModifierChoice, maxSelect: number) => {
      setMultiSel((prev) => {
        const cur = new Set(prev[groupId] ?? []);
        if (cur.has(choice.label)) {
          cur.delete(choice.label);
        } else if (cur.size < maxSelect) {
          cur.add(choice.label);
        }
        return { ...prev, [groupId]: cur };
      });
    },
    []
  );

  // Build GroupSelection[] from current state
  const groupSelections: GroupSelection[] = item.groups
    .map((g) => {
      if (g.type === "single") {
        const c = singleSel[g.id] ?? null;
        return c ? { groupId: g.id, groupLabel: g.label, choices: [c] } : null;
      } else {
        const sel = multiSel[g.id] ?? new Set<string>();
        const chosen = g.choices.filter((c) => sel.has(c.label));
        return chosen.length > 0
          ? { groupId: g.id, groupLabel: g.label, choices: chosen }
          : null;
      }
    })
    .filter((gs): gs is GroupSelection => gs !== null);

  const totalCents = calcLineFromGroups(item.price_cents, groupSelections, qty);

  const allUrls: string[] = item.photos.length > 0
    ? item.photos.map((p) => p.url)
    : item.photo_url
    ? [item.photo_url]
    : [];
  const displayUrl = allUrls[Math.min(photoIdx, allUrls.length - 1)] ?? null;

  const sheetInputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1.5px solid var(--border-subtle)",
    background: "var(--bg-surface)",
    color: "var(--text-primary)",
    fontSize: 14,
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box",
  };

  return (
    <Backdrop onClose={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-elevated)",
          borderRadius: "20px 20px 0 0",
          overflow: "hidden",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          width: "100%",
          maxWidth: 460,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        {/* Photo area */}
        <div style={{ flexShrink: 0 }}>
          <div style={{ position: "relative", height: 218 }}>
            {displayUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={displayUrl}
                alt={item.name}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  background:
                    "linear-gradient(135deg, var(--color-brand) 0%, var(--color-brand-purple) 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 56,
                }}
              >
                🍽️
              </div>
            )}
            <button
              onClick={onClose}
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                width: 34,
                height: 34,
                borderRadius: "50%",
                background: "rgba(0,0,0,0.55)",
                border: "none",
                color: "#fff",
                fontSize: 18,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          {/* Photo thumbnails */}
          {allUrls.length > 1 && (
            <div
              style={{
                display: "flex",
                gap: 8,
                padding: "10px 16px",
                overflowX: "auto",
                background: "var(--bg-elevated)",
              }}
            >
              {allUrls.map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={url}
                  alt=""
                  onClick={() => setPhotoIdx(i)}
                  style={{
                    width: 42,
                    height: 42,
                    objectFit: "cover",
                    borderRadius: 8,
                    flexShrink: 0,
                    cursor: "pointer",
                    border: i === photoIdx
                      ? "2.5px solid var(--color-gold)"
                      : "2px solid transparent",
                    opacity: i === photoIdx ? 1 : 0.65,
                    transition: "opacity .15s, border-color .15s",
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: "auto", flex: 1, padding: "16px 16px 8px" }}>
          {/* Name + base price */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 4,
            }}
          >
            <h3
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "var(--text-primary)",
                margin: 0,
                flex: 1,
                paddingRight: 12,
              }}
            >
              {item.name}
            </h3>
            <span
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: "var(--color-gold)",
                flexShrink: 0,
              }}
            >
              {fmtPrice(item.price_cents)}
            </span>
          </div>
          {item.description && (
            <p
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                lineHeight: 1.6,
                margin: "0 0 18px",
              }}
            >
              {item.description}
            </p>
          )}

          {/* Modifier groups */}
          {item.groups.map((group) => {
            const multiSet = multiSel[group.id] ?? new Set<string>();
            const atMax = group.type === "multi" && multiSet.size >= group.max_select;

            return (
              <div key={group.id} style={{ marginBottom: 20 }}>
                {/* Group header */}
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--text-secondary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 10,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {group.label}
                  {group.type === "multi" && group.max_select < group.choices.length && (
                    <span style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
                      · hasta {group.max_select}
                    </span>
                  )}
                  {group.type === "multi" && group.min_select > 0 && (
                    <span style={{ fontSize: 11, color: "var(--color-danger)", textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>
                      · mín {group.min_select}
                    </span>
                  )}
                </div>

                {/* Single-choice: horizontal chips */}
                {group.type === "single" && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {group.choices.map((choice) => {
                      const active = singleSel[group.id]?.label === choice.label;
                      return (
                        <button
                          key={choice.label}
                          onClick={() => setSingleSel((prev) => ({ ...prev, [group.id]: choice }))}
                          style={{
                            padding: "8px 14px",
                            borderRadius: 10,
                            border: active
                              ? "2px solid var(--color-gold)"
                              : "1.5px solid var(--border-subtle)",
                            background: active
                              ? "rgba(217,119,6,0.12)"
                              : "var(--bg-surface)",
                            color: active ? "var(--color-gold)" : "var(--text-primary)",
                            fontWeight: active ? 600 : 400,
                            fontSize: 13.5,
                            cursor: "pointer",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 2,
                            transition: "border-color .15s, background .15s",
                          }}
                        >
                          <span>{choice.label}</span>
                          {choice.price_cents !== 0 && (
                            <span style={{ fontSize: 11, color: active ? "var(--color-gold)" : "var(--text-secondary)", fontWeight: 500 }}>
                              {choice.price_cents > 0 ? "+" : "−"}{fmtPrice(Math.abs(choice.price_cents))}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Multi-choice: checkbox rows */}
                {group.type === "multi" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {group.choices.map((choice) => {
                      const active = multiSet.has(choice.label);
                      const disabled = !active && atMax;
                      return (
                        <button
                          key={choice.label}
                          disabled={disabled}
                          onClick={() => toggleMulti(group.id, choice, group.max_select)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "10px 4px",
                            borderRadius: 10,
                            border: "none",
                            background: active ? "rgba(217,119,6,0.07)" : "transparent",
                            cursor: disabled ? "not-allowed" : "pointer",
                            opacity: disabled ? 0.4 : 1,
                            width: "100%",
                            textAlign: "left",
                          }}
                        >
                          <span
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 6,
                              border: active ? "none" : "2px solid var(--border-subtle)",
                              background: active ? "var(--color-gold)" : "transparent",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                              transition: "background .15s",
                            }}
                          >
                            {active && <span style={{ color: "#fff", fontSize: 13, lineHeight: 1, fontWeight: 700 }}>✓</span>}
                          </span>
                          <span style={{ flex: 1, fontSize: 14, color: "var(--text-primary)", fontWeight: active ? 500 : 400 }}>
                            {choice.label}
                          </span>
                          {choice.price_cents > 0 && (
                            <span style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500, paddingRight: 4 }}>
                              +{fmtPrice(choice.price_cents)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Notes */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
              Notas para la cocina
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Sin cebolla, extra salsa..."
              rows={2}
              maxLength={200}
              style={{ ...sheetInputStyle, resize: "none" }}
            />
          </div>

          <div style={{ height: 8 }} />
        </div>

        {/* Fixed bottom bar: qty stepper + add button */}
        <div
          style={{
            padding: "12px 16px",
            paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
            background: "var(--bg-elevated)",
            borderTop: "1px solid var(--border-subtle)",
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          {/* Qty stepper */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              borderRadius: 12,
              overflow: "hidden",
              border: "1.5px solid var(--border-subtle)",
              flexShrink: 0,
            }}
          >
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              style={{
                width: 38,
                height: 42,
                border: "none",
                background: "var(--bg-surface)",
                color: "var(--text-primary)",
                fontSize: 20,
                cursor: "pointer",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              −
            </button>
            <span
              style={{
                width: 32,
                textAlign: "center",
                fontWeight: 700,
                fontSize: 15,
                color: "var(--text-primary)",
                background: "var(--bg-elevated)",
              }}
            >
              {qty}
            </span>
            <button
              onClick={() => setQty((q) => q + 1)}
              style={{
                width: 38,
                height: 42,
                border: "none",
                background: "var(--bg-surface)",
                color: "var(--text-primary)",
                fontSize: 20,
                cursor: "pointer",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              +
            </button>
          </div>

          {/* Add button */}
          <button
            onClick={() => onAddToCart(item, null, [], qty, groupSelections, notes)}
            style={{
              flex: 1,
              padding: "12px 14px",
              borderRadius: 12,
              border: "none",
              background: "linear-gradient(135deg, var(--color-brand) 0%, var(--color-brand-purple) 100%)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>Agregar al pedido</span>
            <span>{fmtPrice(totalCents)}</span>
          </button>
        </div>
      </div>
    </Backdrop>
  );
}

// ── Cart Sheet ────────────────────────────────────────────────────────────────

function CartSheet({
  cartItems,
  onClose,
  onUpdateQty,
  onRemove,
  onContinue,
}: {
  cartItems: CartItem[];
  onClose: () => void;
  onUpdateQty: (cartId: string, delta: number) => void;
  onRemove: (cartId: string) => void;
  onContinue: () => void;
}) {
  const subtotal = cartItems.reduce((s, i) => s + i.lineTotalCents, 0);

  return (
    <Backdrop onClose={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-elevated)",
          borderRadius: "20px 20px 0 0",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          width: "100%",
          maxWidth: 460,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 16px 12px",
            borderBottom: "1px solid var(--border-subtle)",
            flexShrink: 0,
          }}
        >
          <h2
            style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}
          >
            🛒 Tu carrito
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-tertiary)",
              fontSize: 16,
              cursor: "pointer",
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "12px 16px" }}>
          {cartItems.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "40px 0",
                color: "var(--text-tertiary)",
                fontSize: 14,
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 8 }}>🛒</div>
              Tu carrito está vacío
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {cartItems.map((ci) => (
                <div
                  key={ci.cartId}
                  style={{
                    background: "var(--bg-surface)",
                    borderRadius: 12,
                    padding: "12px 14px",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        flex: 1,
                        paddingRight: 8,
                      }}
                    >
                      {ci.name}
                    </span>
                    <button
                      onClick={() => onRemove(ci.cartId)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--color-danger)",
                        cursor: "pointer",
                        fontSize: 14,
                        padding: 0,
                        flexShrink: 0,
                      }}
                    >
                      ✕
                    </button>
                  </div>

                  {(ci.groupSelections.length > 0 ||
                    ci.selectedSize ||
                    ci.selectedExtras.length > 0) && (
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-tertiary)",
                        marginBottom: ci.notes ? 4 : 8,
                        lineHeight: 1.5,
                      }}
                    >
                      {ci.groupSelections.length > 0
                        ? ci.groupSelections
                            .flatMap((gs) => gs.choices.map((c) => c.label))
                            .join(" · ")
                        : [
                            ci.selectedSize?.label,
                            ...ci.selectedExtras.map((e) => e.label),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                    </div>
                  )}
                  {ci.notes && (
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-tertiary)",
                        fontStyle: "italic",
                        marginBottom: 8,
                        lineHeight: 1.5,
                      }}
                    >
                      📝 {ci.notes}
                    </div>
                  )}

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <button
                        onClick={() => onUpdateQty(ci.cartId, -1)}
                        style={smallQtyBtnStyle}
                      >
                        −
                      </button>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: "var(--text-primary)",
                          minWidth: 20,
                          textAlign: "center",
                        }}
                      >
                        {ci.quantity}
                      </span>
                      <button
                        onClick={() => onUpdateQty(ci.cartId, 1)}
                        style={smallQtyBtnStyle}
                      >
                        +
                      </button>
                    </div>
                    <span
                      style={{ fontSize: 14, fontWeight: 700, color: "var(--color-gold)" }}
                    >
                      {fmtPrice(ci.lineTotalCents)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          style={{
            padding: "12px 16px 24px",
            borderTop: "1px solid var(--border-subtle)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 14,
            }}
          >
            <span style={{ fontSize: 14, color: "var(--text-secondary)", fontWeight: 500 }}>
              Subtotal
            </span>
            <span style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>
              {fmtPrice(subtotal)}
            </span>
          </div>
          <button
            onClick={onContinue}
            disabled={cartItems.length === 0}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: 14,
              border: "none",
              background:
                cartItems.length > 0
                  ? "linear-gradient(135deg, var(--color-brand) 0%, var(--color-brand-purple) 100%)"
                  : "var(--bg-surface)",
              color: cartItems.length > 0 ? "#fff" : "var(--text-tertiary)",
              fontSize: 15,
              fontWeight: 700,
              cursor: cartItems.length > 0 ? "pointer" : "not-allowed",
            }}
          >
            Continuar
          </button>
        </div>
      </div>
    </Backdrop>
  );
}

// ── Pickup Sheet ──────────────────────────────────────────────────────────────

function PickupSheet({
  cartItems,
  onBack,
  onConfirm,
}: {
  cartItems: CartItem[];
  onBack: () => void;
  onConfirm: (type: PickupType, tableNumber: string) => void;
}) {
  const [pickupType, setPickupType] = useState<PickupType>("counter");
  const [tableNumber, setTableNumber] = useState("");
  const subtotal = cartItems.reduce((s, i) => s + i.lineTotalCents, 0);
  const canConfirm = pickupType === "counter" || tableNumber.trim().length > 0;

  return (
    <Backdrop onClose={onBack}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-elevated)",
          borderRadius: "20px 20px 0 0",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          width: "100%",
          maxWidth: 460,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "16px 16px 12px",
            borderBottom: "1px solid var(--border-subtle)",
            flexShrink: 0,
          }}
        >
          <button
            onClick={onBack}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-secondary)",
              cursor: "pointer",
              fontSize: 20,
              padding: 0,
              lineHeight: 1,
            }}
          >
            ←
          </button>
          <h2
            style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}
          >
            ¿Cómo quieres recibir tu pedido?
          </h2>
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            {(
              [
                {
                  type: "counter" as PickupType,
                  label: "🍽️ En la barra",
                  desc: "Recoge en el counter cuando esté listo",
                },
                {
                  type: "table" as PickupType,
                  label: "🪑 En mi mesa",
                  desc: "Te lo llevamos a tu mesa",
                },
              ] as const
            ).map(({ type, label, desc }) => {
              const active = pickupType === type;
              return (
                <button
                  key={type}
                  onClick={() => setPickupType(type)}
                  style={{
                    padding: "14px 16px",
                    borderRadius: 14,
                    border: active
                      ? "2px solid var(--color-brand)"
                      : "1px solid var(--border-subtle)",
                    background: active ? "rgba(79,70,229,0.1)" : "var(--bg-surface)",
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%",
                  }}
                >
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: active ? "var(--color-brand)" : "var(--text-primary)",
                      marginBottom: 3,
                    }}
                  >
                    {label}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{desc}</div>
                </button>
              );
            })}
          </div>

          {pickupType === "table" && (
            <div style={{ marginBottom: 20 }}>
              <label
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  display: "block",
                  marginBottom: 8,
                }}
              >
                Número de mesa
              </label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="Ej: 12"
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid var(--border-subtle)",
                  background: "var(--bg-surface)",
                  color: "var(--text-primary)",
                  fontSize: 15,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
          )}

          <div
            style={{
              background: "var(--bg-surface)",
              borderRadius: 14,
              padding: "14px 16px",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 10,
              }}
            >
              Resumen del pedido
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {cartItems.map((ci) => (
                <div
                  key={ci.cartId}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 13, color: "var(--text-secondary)", flex: 1 }}>
                    {ci.quantity}× {ci.name}
                    {ci.groupSelections.length > 0
                      ? ` (${ci.groupSelections.flatMap((gs) => gs.choices.map((c) => c.label)).join(", ")})`
                      : ci.selectedSize
                      ? ` (${ci.selectedSize.label})`
                      : ""}
                  </span>
                  <span
                    style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", flexShrink: 0 }}
                  >
                    {fmtPrice(ci.lineTotalCents)}
                  </span>
                </div>
              ))}
            </div>
            <div
              style={{
                borderTop: "1px solid var(--border-subtle)",
                marginTop: 10,
                paddingTop: 10,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                Total
              </span>
              <span style={{ fontSize: 16, fontWeight: 700, color: "var(--color-gold)" }}>
                {fmtPrice(subtotal)}
              </span>
            </div>
          </div>
        </div>

        <div
          style={{
            padding: "12px 16px 24px",
            borderTop: "1px solid var(--border-subtle)",
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => canConfirm && onConfirm(pickupType, tableNumber.trim())}
            disabled={!canConfirm}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: 14,
              border: "none",
              background: canConfirm
                ? "linear-gradient(135deg, #059669 0%, #0d9488 100%)"
                : "var(--bg-surface)",
              color: canConfirm ? "#fff" : "var(--text-tertiary)",
              fontSize: 15,
              fontWeight: 700,
              cursor: canConfirm ? "pointer" : "not-allowed",
            }}
          >
            Confirmar pedido (demo)
          </button>
          {pickupType === "table" && !tableNumber.trim() && (
            <p
              style={{
                fontSize: 11,
                color: "var(--color-danger)",
                textAlign: "center",
                margin: "8px 0 0",
              }}
            >
              Ingresa el número de mesa
            </p>
          )}
        </div>
      </div>
    </Backdrop>
  );
}

// ── Success Sheet ─────────────────────────────────────────────────────────────

function SuccessSheet({
  pickupType,
  tableNumber,
  onDone,
}: {
  pickupType: PickupType;
  tableNumber: string;
  onDone: () => void;
}) {
  return (
    <Backdrop onClose={onDone}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-elevated)",
          borderRadius: "20px 20px 0 0",
          padding: "32px 24px 40px",
          textAlign: "center",
          width: "100%",
          maxWidth: 460,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
        <h2
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "var(--text-primary)",
            margin: "0 0 10px",
          }}
        >
          ¡Pedido recibido!
        </h2>
        <p
          style={{
            fontSize: 14,
            color: "var(--text-secondary)",
            lineHeight: 1.6,
            margin: "0 0 8px",
          }}
        >
          {pickupType === "counter"
            ? "Recoge tu pedido en la barra cuando esté listo."
            : `Te lo llevamos a la mesa ${tableNumber}.`}
        </p>
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "0 0 28px" }}>
          Pago próximamente — esto es una demo del flujo.
        </p>
        <button
          onClick={onDone}
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: 14,
            border: "none",
            background:
              "linear-gradient(135deg, var(--color-brand) 0%, var(--color-brand-purple) 100%)",
            color: "#fff",
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Seguir viendo el menú
        </button>
      </div>
    </Backdrop>
  );
}

// ── Backdrop ──────────────────────────────────────────────────────────────────

function Backdrop({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        alignItems: "center",
      }}
    >
      {children}
    </div>
  );
}

// ── Shared button styles ──────────────────────────────────────────────────────

const qtyBtnStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: "50%",
  border: "1px solid var(--border-subtle)",
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
  fontSize: 20,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 700,
  lineHeight: 1,
};

const smallQtyBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: "50%",
  border: "1px solid var(--border-subtle)",
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
  fontSize: 16,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 700,
  lineHeight: 1,
};

// ── Empty menu state ──────────────────────────────────────────────────────────

function EmptyMenu({ bizName }: { bizName: string }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "60px 24px",
        color: "var(--text-tertiary)",
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 12 }}>🍽️</div>
      <h2
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: "var(--text-secondary)",
          margin: "0 0 8px",
        }}
      >
        {bizName} aún no tiene menú
      </h2>
      <p style={{ fontSize: 13, margin: 0, lineHeight: 1.6 }}>
        Estamos preparando algo delicioso. Vuelve pronto.
      </p>
    </div>
  );
}

// ── Cart FAB ──────────────────────────────────────────────────────────────────

function CartFAB({
  count,
  total,
  onClick,
}: {
  count: number;
  total: number;
  onClick: () => void;
}) {
  if (count === 0) return null;

  return (
    <button
      onClick={onClick}
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 30,
        background:
          "linear-gradient(135deg, var(--color-brand) 0%, var(--color-brand-purple) 100%)",
        color: "#fff",
        border: "none",
        borderRadius: 24,
        padding: "14px 24px",
        fontSize: 15,
        fontWeight: 700,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 12,
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          background: "rgba(255,255,255,0.25)",
          borderRadius: 12,
          padding: "2px 8px",
          fontSize: 13,
        }}
      >
        {count}
      </span>
      Ver carrito · {fmtPrice(total)}
    </button>
  );
}

// ── Main MenuPageClient ───────────────────────────────────────────────────────

export default function MenuPageClient({
  business,
  categories,
}: {
  business: PublicBusiness;
  categories: PublicMenuCategory[];
}) {
  const cardEffect = (business.menu_card_effect ?? "lift") as CardEffect;

  // ── Hover state for card effects (lifted here for tilt/spotlight mouse tracking)
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ mx: 0.5, my: 0.5 });

  const handleCardEnter = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, id: string) => {
      const r = e.currentTarget.getBoundingClientRect();
      setMousePos({
        mx: (e.clientX - r.left) / r.width,
        my: (e.clientY - r.top) / r.height,
      });
      setHoveredCardId(id);
    },
    []
  );

  const handleCardLeave = useCallback(() => {
    setHoveredCardId(null);
  }, []);

  const handleCardMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, id: string) => {
      if (hoveredCardId === id) {
        const r = e.currentTarget.getBoundingClientRect();
        setMousePos({
          mx: (e.clientX - r.left) / r.width,
          my: (e.clientY - r.top) / r.height,
        });
      }
    },
    [hoveredCardId]
  );

  // ── Cart state ──────────────────────────────────────────────────────────────
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [customizerItem, setCustomizerItem] = useState<PublicMenuItem | null>(null);
  const [step, setStep] = useState<AppStep>("menu");
  const [pickupType, setPickupType] = useState<PickupType>("counter");
  const [pickupTable, setPickupTable] = useState("");

  // ── Category nav active tracking ────────────────────────────────────────────
  const [activeCategory, setActiveCategory] = useState<string>(
    categories[0]?.id ?? ""
  );
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());

  useEffect(() => {
    if (categories.length === 0) return;

    const observers: IntersectionObserver[] = [];
    const NAV_HEIGHT = 56;

    categories.forEach((cat) => {
      const el = sectionRefs.current.get(cat.id);
      if (!el) return;

      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveCategory(cat.id);
        },
        { rootMargin: `-${NAV_HEIGHT}px 0px -60% 0px`, threshold: 0 }
      );
      obs.observe(el);
      observers.push(obs);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, [categories]);

  const scrollToCategory = useCallback((catId: string) => {
    setActiveCategory(catId);
    document.getElementById(`cat-${catId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  // ── Cart handlers ───────────────────────────────────────────────────────────
  const addToCart = useCallback(
    (
      item: PublicMenuItem,
      size: MenuItemOption | null,
      extras: MenuItemOption[],
      qty: number,
      groupSelections: GroupSelection[] = [],
      notes?: string
    ) => {
      const lineTotalCents =
        groupSelections.length > 0
          ? calcLineFromGroups(item.price_cents, groupSelections, qty)
          : calcLine(item.price_cents, size, extras, qty);
      setCartItems((prev) => [
        ...prev,
        {
          cartId: `${item.id}-${Date.now()}`,
          itemId: item.id,
          name: item.name,
          basePriceCents: item.price_cents,
          quantity: qty,
          selectedSize: size,
          selectedExtras: extras,
          groupSelections,
          lineTotalCents,
          notes: notes?.trim() || undefined,
        },
      ]);
      setCustomizerItem(null);
    },
    []
  );

  const updateQty = useCallback((cartId: string, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((ci) => {
          if (ci.cartId !== cartId) return ci;
          const newQty = ci.quantity + delta;
          if (newQty <= 0) return null;
          const lineTotalCents =
            ci.groupSelections.length > 0
              ? calcLineFromGroups(ci.basePriceCents, ci.groupSelections, newQty)
              : calcLine(ci.basePriceCents, ci.selectedSize, ci.selectedExtras, newQty);
          return { ...ci, quantity: newQty, lineTotalCents };
        })
        .filter(Boolean) as CartItem[]
    );
  }, []);

  const removeFromCart = useCallback((cartId: string) => {
    setCartItems((prev) => prev.filter((ci) => ci.cartId !== cartId));
  }, []);

  const handleItemAdd = useCallback(
    (item: PublicMenuItem) => {
      if (item.groups.length > 0) {
        setCustomizerItem(item);
      } else {
        addToCart(item, null, [], 1);
      }
    },
    [addToCart]
  );

  const cartCount = cartItems.reduce((s, i) => s + i.quantity, 0);
  const cartTotal = cartItems.reduce((s, i) => s + i.lineTotalCents, 0);

  return (
    <main
      data-theme="dark"
      style={{
        background: "var(--bg-base)",
        minHeight: "100vh",
        color: "var(--text-primary)",
        paddingBottom: cartCount > 0 ? 96 : 32,
      }}
    >
      <BusinessHeader biz={business} />

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
              effect={cardEffect}
              hoveredCardId={hoveredCardId}
              mx={mousePos.mx}
              my={mousePos.my}
              onCardEnter={handleCardEnter}
              onCardLeave={handleCardLeave}
              onCardMove={handleCardMove}
              onItemAdd={handleItemAdd}
            />
          ))}
        </div>
      )}

      <CartFAB count={cartCount} total={cartTotal} onClick={() => setStep("cart")} />

      {customizerItem && (
        <CustomizerSheet
          item={customizerItem}
          onClose={() => setCustomizerItem(null)}
          onAddToCart={addToCart}
        />
      )}

      {step === "cart" && (
        <CartSheet
          cartItems={cartItems}
          onClose={() => setStep("menu")}
          onUpdateQty={updateQty}
          onRemove={removeFromCart}
          onContinue={() => setStep("pickup")}
        />
      )}

      {step === "pickup" && (
        <PickupSheet
          cartItems={cartItems}
          onBack={() => setStep("cart")}
          onConfirm={(type, table) => {
            setPickupType(type);
            setPickupTable(table);
            setStep("success");
          }}
        />
      )}

      {step === "success" && (
        <SuccessSheet
          pickupType={pickupType}
          tableNumber={pickupTable}
          onDone={() => {
            setCartItems([]);
            setStep("menu");
          }}
        />
      )}
    </main>
  );
}
