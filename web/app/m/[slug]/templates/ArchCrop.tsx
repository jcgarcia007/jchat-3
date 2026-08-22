"use client";

/**
 * #35 Arch Crop — board-faithful port ("Maison Arche" boutique bakery)
 *
 * Photos cropped into soft arches (border-radius 80px 80px 14px 14px) arranged
 * in a 2-column grid. Warm cream background (#FBF6EE), dark-brown text (#4A3A28),
 * amber accent (#C07C3A). Playfair Display for the business name. Horizontal
 * category chips for navigation. Fixed cart bar at bottom.
 *
 * Critical fixes applied:
 *  • padding-bottom trick for arch photos (not CSS aspect-ratio)
 *  • gallery-first photo URL
 *  • var(--menu-vh, 100dvh) for the full-height container
 *  • env(safe-area-inset-bottom) in the fixed cart bar
 *  • section refs + scrollMarginTop for each category
 *  • own cart bar → added to suppressedTemplates in MenuPageClient
 */

import { useCallback, useState } from "react";
import { IconShoppingBag } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { fmtPrice } from "./shared/format";
import { getBadgeConfig } from "./shared/CategorySection";
import type { MenuTemplateProps } from "./types";
import type { PublicMenuItem } from "../page";

// ── Design constants (board #35 faithful) ──────────────────────────────────
const BG = "#FBF6EE";
const TEXT = "#4A3A28";
const TEXT_MUTED = "#6E5B4E";
const ACCENT = "#C07C3A";
const ACCENT_SOFT = "rgba(192,124,58,0.12)";
const CART_BG = "#4A3A28";
const CART_PRICE_COLOR = "#E4B77E";
const CHIP_ACTIVE_BG = "#4A3A28";
const CHIP_ACTIVE_TEXT = "#FBF6EE";
const CHIP_BG = "rgba(74,58,40,0.08)";
const CHIP_TEXT = "#6E5B4E";
const CARD_SHADOW = "0 8px 18px rgba(74,58,40,.14)";

export default function ArchCrop({
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
        height: "var(--menu-vh, 100dvh)",
        background: BG,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* ── Fixed header ─────────────────────────────────────────────────── */}
      <div
        style={{
          flexShrink: 0,
          background: BG,
          paddingTop: "env(safe-area-inset-top, 0px)",
          zIndex: 20,
        }}
      >
        {/* Business name + subtitle */}
        <div style={{ textAlign: "center", padding: "14px 22px 4px" }}>
          <div
            style={{
              fontFamily: "var(--font-playfair), 'Playfair Display', Georgia, serif",
              fontSize: 25,
              color: TEXT,
              lineHeight: 1.1,
            }}
          >
            {business.name}
          </div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: "3px",
              color: ACCENT,
              marginTop: 4,
            }}
          >
            {(business.category ?? "MENU").toUpperCase()}
          </div>
        </div>

        {/* Category chips */}
        <div
          style={{
            display: "flex",
            gap: 8,
            overflowX: "auto",
            padding: "8px 22px 10px",
            scrollbarWidth: "none",
            justifyContent: categories.length <= 3 ? "center" : undefined,
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
                  fontSize: 11.5,
                  fontWeight: 700,
                  padding: "6px 14px",
                  borderRadius: 99,
                  border: "none",
                  cursor: "pointer",
                  background: isActive ? CHIP_ACTIVE_BG : CHIP_BG,
                  color: isActive ? CHIP_ACTIVE_TEXT : CHIP_TEXT,
                  transition: "background .2s ease, color .2s ease",
                  letterSpacing: "0.2px",
                }}
              >
                {cat.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Scrollable item grid ──────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "10px 18px 20px",
          // bottom padding accounts for the fixed cart bar
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
            {/* Category heading */}
            <div
              style={{
                fontFamily: "var(--font-playfair), 'Playfair Display', Georgia, serif",
                fontSize: 18,
                color: TEXT,
                marginBottom: 16,
                marginTop: 10,
                paddingBottom: 8,
                borderBottom: `0.5px solid rgba(74,58,40,0.15)`,
              }}
            >
              {cat.name}
            </div>

            {/* 2-col arch grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "18px 14px",
                marginBottom: 24,
              }}
            >
              {cat.items.map((item) => (
                <ArchCard
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

      {/* ── Fixed cart bar ────────────────────────────────────────────────── */}
      {cartCount > 0 && (
        <button
          type="button"
          onClick={onOpenCart}
          style={{
            position: "absolute",
            left: 16,
            right: 16,
            bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
            background: CART_BG,
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
          <span style={{ fontSize: 13, fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", gap: 8 }}>
            <IconShoppingBag size={16} color="#fff" />
            {cartCount} {cartCount === 1 ? t("item") : t("items")}
          </span>
          <span style={{ fontSize: 13, fontWeight: 800, color: CART_PRICE_COLOR }}>
            {fmtPrice(cartTotal)} →
          </span>
        </button>
      )}
    </div>
  );
}

// ── Individual arch card ──────────────────────────────────────────────────────
function ArchCard({
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
  const badge = item.badge ? getBadgeConfig(t)[item.badge] : null;

  // Gallery-first photo URL
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
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      {/* Arch photo container — padding-bottom trick for iOS (not aspect-ratio CSS) */}
      <div
        style={{
          position: "relative",
          width: "100%",
          // Arch shape: rounded top, squared bottom corners
          borderRadius: "80px 80px 14px 14px",
          overflow: "hidden",
          boxShadow: CARD_SHADOW,
          opacity: soldOut ? 0.6 : 1,
          // padding-bottom trick: height:0 + paddingBottom sets the aspect ratio
          height: 0,
          paddingBottom: "116%", // ≈ 180/155 ratio (board uses height:180px on ~155px wide col)
        }}
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
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
              background: "rgba(74,58,40,0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 36,
            }}
          >
            🥐
          </div>
        )}

        {/* Fav button */}
        <button
          type="button"
          onClick={onFav}
          aria-label={isFaved ? t("removeFavoriteAria") : t("addFavoriteAria")}
          style={{
            position: "absolute",
            top: 12,
            right: 12,
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
            color: isFaved ? "#E24B4A" : "#9C8E7B",
          }}
        >
          {isFaved ? "♥" : "♡"}
        </button>

        {/* Badge (if any) */}
        {badge && (
          <div
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              fontSize: 9,
              fontWeight: 800,
              padding: "2px 7px",
              borderRadius: 99,
              background: badge.bg,
              color: badge.color,
            }}
          >
            {badge.label}
          </div>
        )}

        {/* Add button — overlaid at bottom-right */}
        <button
          type="button"
          onClick={handleAdd}
          disabled={soldOut}
          aria-label={t("addToCartAria")}
          style={{
            position: "absolute",
            right: 8,
            bottom: 8,
            width: 34,
            height: 34,
            borderRadius: 99,
            background: soldOut ? "rgba(255,255,255,.5)" : justAdded ? "#059669" : ACCENT,
            color: "#fff",
            border: "2px solid #fff",
            fontSize: 19,
            fontWeight: 300,
            cursor: soldOut ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
            padding: 0,
            transform: justAdded ? "scale(1.1)" : "scale(1)",
            transition: "background .2s ease, transform .18s cubic-bezier(.22,1,.36,1)",
          }}
        >
          {justAdded ? "✓" : "+"}
        </button>
      </div>

      {/* Item name */}
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: TEXT,
          marginTop: 8,
          textAlign: "center",
          lineHeight: 1.15,
          paddingInline: 4,
        }}
      >
        {item.name}
      </div>

      {/* Price */}
      <div
        style={{
          fontSize: 12,
          fontWeight: 800,
          color: soldOut ? TEXT_MUTED : ACCENT,
          marginTop: 2,
        }}
      >
        {soldOut ? t("soldOut") : fmtPrice(item.price_cents)}
      </div>
    </div>
  );
}
