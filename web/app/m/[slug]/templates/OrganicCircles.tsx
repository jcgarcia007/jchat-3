"use client";

/**
 * #24 Organic Circles — board-faithful port ("Scoops & Co." gelato & bakes)
 *
 * Round photos break the grid's hard edges — a playful, scoop-shop feel.
 * Each circle floats its own add button on the rim (+), fav button on the top-left.
 * 2-col grid; category chips + header; own cart bar.
 *
 * BG: #FFF0F4 · Accent: #E85D8A (magenta) · Text: #8A2B4A
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

const BG = "#FFF0F4";
const TEXT = "#8A2B4A";
const ACCENT = "#E85D8A";
const ACCENT_ON = "#FFFFFF";
const CARD_BG = "#FFFFFF";
const SURFACE = "#FFFFFF";
const BORDER = "#F4D3DF";
const CHIP_BG = "rgba(232,93,138,.10)";
const CHIP_TEXT = "#E85D8A";
const CHIP_ACTIVE_BG = "#E85D8A";
const CHIP_ACTIVE_TEXT = "#fff";

export default function OrganicCircles({
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
            padding: "6px 20px 0",
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
            padding: "8px 20px 6px",
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

      {/* ── Scrollable grid ────────────────────────────────────────── */}
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
                color: "rgba(138,43,74,.45)",
                padding: "10px 20px 4px",
              }}
            >
              {cat.name.toUpperCase()}
            </div>

            {/* 2-col circle grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "22px 16px",
                justifyItems: "center",
                padding: "8px 20px 12px",
              }}
            >
              {cat.items.map((item) => (
                <CircleCard
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

// ── One circle card ──────────────────────────────────────────────────────────
function CircleCard({
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
      {/* Circle container */}
      <div style={{ position: "relative", width: 148, height: 148, flexShrink: 0 }}>
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={item.name}
            style={{
              width: 148,
              height: 148,
              borderRadius: "999px",
              objectFit: "cover",
              border: "4px solid #fff",
              boxShadow: "0 8px 20px rgba(138,43,74,.18)",
              display: "block",
              opacity: soldOut ? 0.65 : 1,
            }}
          />
        ) : (
          <div
            style={{
              width: 148,
              height: 148,
              borderRadius: "999px",
              background: "#F4D3DF",
              border: "4px solid #fff",
              boxShadow: "0 8px 20px rgba(138,43,74,.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 44,
            }}
          >
            🍦
          </div>
        )}

        {/* Fav — top-left */}
        <button
          type="button"
          onClick={onFav}
          aria-label={isFaved ? t("removeFavoriteAria") : t("addFavoriteAria")}
          style={{
            position: "absolute",
            top: 6,
            left: 8,
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
            color: isFaved ? "#FF4D6D" : "#8A2B4A",
          }}
        >
          {isFaved ? "♥" : "♡"}
        </button>

        {/* Add — bottom-right on rim */}
        <button
          type="button"
          onClick={handleAdd}
          disabled={soldOut}
          aria-label={t("addToCartAria")}
          style={{
            position: "absolute",
            right: 2,
            bottom: 6,
            width: 40,
            height: 40,
            borderRadius: 99,
            background: soldOut ? "rgba(255,255,255,.5)" : justAdded ? "#059669" : "#E85D8A",
            color: "#fff",
            border: "3px solid #fff",
            fontSize: 22,
            fontWeight: 300,
            cursor: soldOut ? "not-allowed" : "pointer",
            boxShadow: "0 6px 16px rgba(232,93,138,.45)",
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
      <div style={{ fontSize: 13, fontWeight: 700, color: "#8A2B4A", marginTop: 10, textAlign: "center", lineHeight: 1.15 }}>
        {item.name}
      </div>
      <div style={{ fontSize: 12, fontWeight: 800, color: "#E85D8A", marginTop: 2 }}>
        {soldOut ? t("soldOut") : fmtPrice(item.price_cents)}
      </div>
    </div>
  );
}
