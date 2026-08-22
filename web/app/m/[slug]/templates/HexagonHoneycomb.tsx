"use client";

/**
 * #29 Hexagon Honeycomb — board-faithful port ("Grove" health-food bowls & juice)
 *
 * Photos clipped into hexagons — a fresh, geometric feel for a health-food brand.
 * The shape itself signals "different," and the tessellated grid keeps big
 * imagery dense without feeling like a plain photo list.
 *
 * BG: #F2F7F0 · Accent: #2E9E5B (green) · Text: #1D3524
 *
 * Critical fixes:
 *  • gallery-first photo URL
 *  • env(safe-area-inset-bottom) in cart bar
 *  • own cart bar → suppressedTemplates
 *  • own header → showBusinessHeader exclusion
 */

import { useCallback, useState } from "react";
import { IconShoppingBag } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { fmtPrice } from "./shared/format";
import type { MenuTemplateProps } from "./types";
import type { PublicMenuItem } from "../page";

const BG = "#F2F7F0";
const TEXT = "#1D3524";
const ACCENT = "#2E9E5B";
const ACCENT_ON = "#FFFFFF";
const SURFACE = "#FFFFFF";
const BORDER = "#DCE8DC";
const CHIP_BG = "rgba(46,158,91,.10)";
const CHIP_TEXT = "#2E9E5B";
const CHIP_ACTIVE_BG = "#2E9E5B";
const CHIP_ACTIVE_TEXT = "#fff";

// CSS clip-path for a regular hexagon (flat-top variant from the board)
const HEX_CLIP = "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

export default function HexagonHoneycomb({
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
  const t = useTranslations("menu");
  const [favIds, setFavIds] = useState<Set<string>>(new Set());

  const toggleFav = useCallback((id: string) => {
    setFavIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <div
      style={{
        position: "relative",
        minHeight: "var(--menu-vh, 100dvh)",
        background: BG,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div
        style={{
          flexShrink: 0,
          paddingTop: "max(16px, env(safe-area-inset-top, 0px))",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "6px 22px 0",
          }}
        >
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.5px", color: TEXT }}>
              {business.name}
            </div>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "2px", color: ACCENT, marginTop: 2 }}>
              {(business.category ?? "MENU").toUpperCase()}
            </div>
          </div>

          {/* Cart icon */}
          <button
            type="button"
            onClick={onOpenCart}
            aria-label={t("openCartAria")}
            style={{
              position: "relative",
              width: 38,
              height: 38,
              borderRadius: 999,
              background: SURFACE,
              border: `0.5px solid ${BORDER}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <IconShoppingBag size={18} color={TEXT} />
            {cartCount > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: -4,
                  right: -4,
                  minWidth: 18,
                  height: 18,
                  borderRadius: 99,
                  background: ACCENT,
                  color: ACCENT_ON,
                  fontSize: 10,
                  fontWeight: 900,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingInline: 4,
                }}
              >
                {cartCount}
              </span>
            )}
          </button>
        </div>

        {/* Category chips */}
        <div
          style={{
            display: "flex",
            gap: 8,
            overflowX: "auto",
            padding: "6px 22px 6px",
            scrollbarWidth: "none",
          }}
        >
          {categories.map((cat) => {
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => scrollToCategory(cat.id)}
                style={{
                  flexShrink: 0,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "5px 13px",
                  borderRadius: 99,
                  border: "none",
                  cursor: "pointer",
                  background: isActive ? CHIP_ACTIVE_BG : CHIP_BG,
                  color: isActive ? CHIP_ACTIVE_TEXT : CHIP_TEXT,
                  transition: "background .18s ease, color .18s ease",
                }}
              >
                {cat.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Scrollable hex grid ────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          paddingBottom: cartCount > 0 ? "calc(74px + env(safe-area-inset-bottom, 0px))" : 20,
        }}
      >
        {categories.map((cat) => (
          <section
            key={cat.id}
            id={`cat-${cat.id}`}
            style={{ scrollMarginTop: 56 }}
            ref={(el) => {
              if (el) sectionRefs.current.set(cat.id, el);
              else sectionRefs.current.delete(cat.id);
            }}
          >
            {/* Category label */}
            <div
              style={{
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: "2px",
                color: "rgba(29,53,36,.4)",
                padding: "10px 22px 4px",
              }}
            >
              {cat.name.toUpperCase()}
            </div>

            {/* 2-col hexagon grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "16px 14px",
                justifyItems: "center",
                padding: "8px 18px 12px",
              }}
            >
              {cat.items.map((item) => (
                <HexCard
                  key={item.id}
                  item={item}
                  isFaved={favIds.has(item.id)}
                  onFav={() => toggleFav(item.id)}
                  onAdd={() => onItemAdd(item)}
                  t={t}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* ── Cart bar ──────────────────────────────────────────────── */}
      {cartCount > 0 && (
        <button
          type="button"
          onClick={onOpenCart}
          style={{
            position: "fixed",
            left: 16,
            right: 16,
            bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
            background: ACCENT,
            borderRadius: 16,
            padding: "13px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            border: "none",
            zIndex: 30,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 800, color: ACCENT_ON }}>
            {cartCount} {cartCount === 1 ? t("item") : t("items")}
          </span>
          <span style={{ fontSize: 13, fontWeight: 800, color: ACCENT_ON }}>
            {fmtPrice(cartTotal)} →
          </span>
        </button>
      )}
    </div>
  );
}

// ── One hexagon card ─────────────────────────────────────────────────────────
function HexCard({
  item,
  isFaved,
  onFav,
  onAdd,
  t,
}: {
  item: PublicMenuItem;
  isFaved: boolean;
  onFav: () => void;
  onAdd: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}) {
  const [justAdded, setJustAdded] = useState(false);
  const soldOut = item.stock_count !== null && item.stock_count === 0;

  const galleryUrl = item.photos?.find((p) => p.url && p.url.trim() !== "")?.url;
  const photoUrl = galleryUrl ?? (item.photo_url?.trim() ? item.photo_url : undefined);

  const handleAdd = () => {
    if (soldOut) return;
    onAdd();
    if (!item.groups.length) {
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 1100);
    }
  };

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
      {/* Hexagon container — 150 × 168 as per board */}
      <div style={{ position: "relative", width: 150, height: 168, flexShrink: 0 }}>
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={item.name}
            style={{
              width: 150,
              height: 168,
              objectFit: "cover",
              clipPath: HEX_CLIP,
              display: "block",
              opacity: soldOut ? 0.65 : 1,
            }}
          />
        ) : (
          <div
            style={{
              width: 150,
              height: 168,
              background: "#C8E6C9",
              clipPath: HEX_CLIP,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 40,
            }}
          >
            🥗
          </div>
        )}

        {/* Fav — horizontally centered, near top */}
        <button
          type="button"
          onClick={onFav}
          aria-label={isFaved ? t("removeFavoriteAria") : t("addFavoriteAria")}
          style={{
            position: "absolute",
            top: 16,
            left: "50%",
            marginLeft: -14,
            width: 28,
            height: 28,
            borderRadius: 99,
            background: "rgba(255,255,255,.9)",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            cursor: "pointer",
            color: isFaved ? "#FF4D6D" : "#1D3524",
          }}
        >
          {isFaved ? "♥" : "♡"}
        </button>

        {/* Add — horizontally centered, near bottom of hex */}
        <button
          type="button"
          onClick={handleAdd}
          disabled={soldOut}
          aria-label={t("addToCartAria")}
          style={{
            position: "absolute",
            bottom: 20,
            left: "50%",
            marginLeft: -17,
            width: 34,
            height: 34,
            borderRadius: 99,
            background: soldOut ? "rgba(255,255,255,.5)" : justAdded ? "#059669" : "#2E9E5B",
            color: "#fff",
            border: "2px solid #fff",
            fontSize: 19,
            fontWeight: 300,
            cursor: soldOut ? "not-allowed" : "pointer",
            boxShadow: "0 6px 14px rgba(46,158,91,.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: justAdded ? "scale(1.1)" : "scale(1)",
            transition: "background .2s ease, transform .18s cubic-bezier(.22,1,.36,1)",
          }}
        >
          {justAdded ? "✓" : soldOut ? "—" : "+"}
        </button>
      </div>

      {/* Name + price */}
      <div style={{ fontSize: 13, fontWeight: 700, color: "#1D3524", marginTop: 6, textAlign: "center", lineHeight: 1.15 }}>
        {item.name}
      </div>
      <div style={{ fontSize: 12, fontWeight: 800, color: "#2E9E5B", marginTop: 2 }}>
        {soldOut ? t("soldOut") : fmtPrice(item.price_cents)}
      </div>
    </div>
  );
}
