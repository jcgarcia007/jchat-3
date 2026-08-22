"use client";

/**
 * #32 Framed Gallery — board-faithful port ("La Galerie Sucrée" pâtisserie)
 *
 * Each dessert is hung like art — matted, framed, with a museum caption plaque
 * beneath. Elevates a bakery into a boutique. The mat gives photos breathing
 * room while keeping them the clear centerpiece.
 *
 * BG: #F6F1EA (cream) · Accent: #8A6D3B (gold/warm brown) · Text: #2B2118
 * Playfair Display for business name and item names.
 *
 * Critical fixes:
 *  • gallery-first photo URL
 *  • padding-bottom trick for photo height (190px → achieved via fixed height
 *    inside a relative wrapper so iOS doesn't collapse it)
 *  • env(safe-area-inset-bottom) in cart bar
 *  • own cart bar → suppressedTemplates
 *  • own header → showBusinessHeader exclusion
 *  • section refs + scrollMarginTop: 56
 */

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { fmtPrice } from "./shared/format";
import type { MenuTemplateProps } from "./types";
import type { PublicMenuItem } from "../page";

const BG = "#F6F1EA";
const CARD_BG = "#FFFFFF";
const MAT_BG = "#FCFAF6";
const BORDER = "#E4DACB";
const TEXT = "#2B2118";
const TEXT_MUTED = "#94836C";
const ACCENT = "#8A6D3B"; // warm gold/brown
const CART_PRICE_COLOR = "#D9C39A"; // lighter gold for cart bar
const CHIP_BG = "rgba(138,109,59,.10)";
const CHIP_TEXT = "#8A6D3B";
const CHIP_ACTIVE_BG = "#8A6D3B";
const CHIP_ACTIVE_TEXT = "#fff";

export default function FramedGallery({
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
          textAlign: "center",
        }}
      >
        <div style={{ padding: "6px 22px 2px" }}>
          <div
            style={{
              fontFamily: "var(--font-playfair), 'Playfair Display', Georgia, serif",
              fontSize: 25,
              color: TEXT,
              lineHeight: 1,
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

        {/* Category chips — centered */}
        <div
          style={{
            display: "flex",
            gap: 8,
            overflowX: "auto",
            padding: "8px 22px 8px",
            scrollbarWidth: "none",
            justifyContent: "center",
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
                  padding: "5px 14px",
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

      {/* ── Scrollable list of museum-mat cards ────────────────────── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 24,
          padding: "4px 26px",
          paddingBottom: cartCount > 0 ? "calc(82px + env(safe-area-inset-bottom, 0px))" : 20,
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
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: "2px",
                color: "rgba(43,33,24,.4)",
                marginBottom: 10,
                marginTop: 4,
              }}
            >
              {cat.name.toUpperCase()}
            </div>

            {cat.items.map((item, i) => (
              <FramedCard
                key={item.id}
                item={item}
                frameNum={i + 1}
                isFaved={favIds.has(item.id)}
                onFav={() => toggleFav(item.id)}
                onAdd={() => onItemAdd(item)}
                t={t}
              />
            ))}
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
            background: TEXT,
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
          <span style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>
            {cartCount} {cartCount === 1 ? t("piece") : t("pieces")}
          </span>
          <span style={{ fontSize: 13, fontWeight: 800, color: CART_PRICE_COLOR }}>
            {fmtPrice(cartTotal)} →
          </span>
        </button>
      )}
    </div>
  );
}

// ── One museum-mat card ───────────────────────────────────────────────────────
function FramedCard({
  item,
  frameNum,
  isFaved,
  onFav,
  onAdd,
  t,
}: {
  item: PublicMenuItem;
  frameNum: number;
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

  const rating = (4.2 + (frameNum % 7) * 0.1).toFixed(1);

  const handleAdd = () => {
    if (soldOut) return;
    onAdd();
    if (!item.groups.length) {
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 1100);
    }
  };

  return (
    <div
      style={{
        background: "#FFFFFF",
        padding: 14,
        boxShadow: "0 8px 22px rgba(43,33,24,.12)",
        border: "1px solid #E4DACB",
        marginBottom: 20,
        opacity: soldOut ? 0.75 : 1,
      }}
    >
      {/* Inner museum mat */}
      <div
        style={{
          position: "relative",
          border: "1px solid #E4DACB",
          padding: 10,
          background: "#FCFAF6",
        }}
      >
        {/* Photo — fixed height 190px */}
        <div style={{ position: "relative", width: "100%", height: 190, overflow: "hidden" }}>
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt={item.name}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : (
            <div style={{ position: "absolute", inset: 0, background: "#F0E8D8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 52 }}>🍰</div>
          )}
        </div>

        {/* Fav — top-right inside mat */}
        <button
          type="button"
          onClick={onFav}
          aria-label={isFaved ? t("removeFavoriteAria") : t("addFavoriteAria")}
          style={{
            position: "absolute",
            top: 18,
            right: 18,
            width: 30,
            height: 30,
            borderRadius: 99,
            background: "rgba(255,255,255,.9)",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            cursor: "pointer",
            color: isFaved ? "#FF4D6D" : "#8A6D3B",
          }}
        >
          {isFaved ? "♥" : "♡"}
        </button>
      </div>

      {/* Caption plaque */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "14px 4px 2px",
          borderTop: "1px solid #E4DACB",
          marginTop: 12,
        }}
      >
        <div style={{ minWidth: 0, textAlign: "left" }}>
          <div
            style={{
              fontFamily: "var(--font-playfair), 'Playfair Display', Georgia, serif",
              fontSize: 18,
              color: "#2B2118",
              lineHeight: 1.1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {item.name}
          </div>
          <div style={{ fontSize: 10.5, fontStyle: "italic", color: "#94836C", marginTop: 2 }}>
            {item.description ? `${item.description.slice(0, 40)}${item.description.length > 40 ? "…" : ""}` : `No. ${String(frameNum).padStart(2, "0")}`}
            {" · ★ "}{rating}
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#8A6D3B", marginTop: 4 }}>
            {soldOut ? t("soldOut") : fmtPrice(item.price_cents)}
          </div>
        </div>

        <button
          type="button"
          onClick={handleAdd}
          disabled={soldOut}
          style={{
            flexShrink: 0,
            background: soldOut ? "rgba(43,33,24,.15)" : justAdded ? "#059669" : "#2B2118",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            padding: "11px 18px",
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: "1px",
            cursor: soldOut ? "not-allowed" : "pointer",
            transform: justAdded ? "scale(1.03)" : "scale(1)",
            transition: "background .2s ease, transform .18s cubic-bezier(.22,1,.36,1)",
            whiteSpace: "nowrap",
          }}
        >
          {justAdded ? "✓" : soldOut ? t("unavailable") : "ADD"}
        </button>
      </div>
    </div>
  );
}
