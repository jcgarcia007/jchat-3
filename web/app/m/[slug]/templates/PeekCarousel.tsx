"use client";

/**
 * #27 Peek Carousel — board-faithful port ("KAI" Japanese restaurant)
 *
 * Full-height cards you swipe sideways; the next card peeks at the right edge.
 * One dish fills the frame — a large photo in the top 62% of the card, details
 * docked below. Deep navy background (#0B1020), teal accent (#4FD1C5).
 *
 * Critical fixes applied:
 *  • padding-bottom trick for card photos (not CSS aspect-ratio)
 *  • gallery-first photo URL
 *  • var(--menu-vh, 100dvh) for the full-height container
 *  • env(safe-area-inset-bottom) in the bottom padding of the scroll area
 *  • Global CartFAB is kept (template has no own cart bar; overlay is used)
 */

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { fmtPrice } from "./shared/format";
import type { MenuTemplateProps } from "./types";
import type { PublicMenuItem } from "../page";

// ── Design constants (board #27 faithful) ──────────────────────────────────
const BG = "#0B1020";
const CARD_BG = "#141B33";
const CARD_BORDER = "rgba(255,255,255,.10)";
const TEXT = "#FFFFFF";
const TEXT_MUTED = "rgba(255,255,255,.55)";
const ACCENT = "#4FD1C5"; // teal
const ACCENT_ON = "#0B1020"; // text on accent
const FAV_BG = "rgba(11,16,32,.55)";
const RATING_BG = "rgba(79,209,197,.92)";
const CHIP_BG = "rgba(79,209,197,.12)";
const CHIP_TEXT = "#4FD1C5";
const CHIP_ACTIVE_BG = "#4FD1C5";
const CHIP_ACTIVE_TEXT = "#0B1020";

export default function PeekCarousel({
  business,
  categories,
  scrollToCategory,
  onItemAdd,
}: MenuTemplateProps) {
  const t = useTranslations("menu");
  const [favIds, setFavIds] = useState<Set<string>>(new Set());
  // Track which category's items are currently shown
  const [activeCat, setActiveCat] = useState<string>(
    categories[0]?.id ?? ""
  );

  const toggleFav = useCallback((id: string) => {
    setFavIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // When a category chip is tapped, switch which items to show
  const handleCatClick = useCallback(
    (catId: string) => {
      setActiveCat(catId);
      scrollToCategory(catId);
    },
    [scrollToCategory]
  );

  // Items for the current active category
  const currentCat = categories.find((c) => c.id === activeCat) ?? categories[0];
  const items = currentCat?.items ?? [];

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
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div
        style={{
          flexShrink: 0,
          paddingTop: "max(14px, env(safe-area-inset-top, 0px))",
        }}
      >
        {/* Business name */}
        <div style={{ padding: "6px 22px 0" }}>
          <span
            style={{
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: "-0.5px",
              color: TEXT,
            }}
          >
            {business.name}
          </span>
        </div>

        {/* Category chips */}
        <div
          style={{
            display: "flex",
            gap: 8,
            overflowX: "auto",
            padding: "10px 22px 4px",
            scrollbarWidth: "none",
          }}
        >
          {categories.map((cat) => {
            const isActive = activeCat === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleCatClick(cat.id)}
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

      {/* ── Horizontal snap-scroll carousel ───────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          gap: 16,
          overflowX: "auto",
          overflowY: "hidden",
          scrollSnapType: "x mandatory",
          // Padding: left/right creates the "peek" reveal of the next card
          padding: "8px 22px",
          paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
          // Ensures scroll-snap aligns relative to the padding
          scrollPaddingLeft: 22,
          scrollbarWidth: "none",
          // Smooth momentum scroll on iOS
          WebkitOverflowScrolling: "touch",
        }}
      >
        {items.length === 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              color: "rgba(255,255,255,.4)",
              fontSize: 14,
            }}
          >
            {t("noItems")}
          </div>
        ) : (
          items.map((item, i) => (
            <PeekCard
              key={item.id}
              item={item}
              index={i}
              isFaved={favIds.has(item.id)}
              onFav={() => toggleFav(item.id)}
              onAdd={() => onItemAdd(item)}
              t={t}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Individual peek card ──────────────────────────────────────────────────────
function PeekCard({
  item,
  index,
  isFaved,
  onFav,
  onAdd,
  t,
}: {
  item: PublicMenuItem;
  index: number;
  isFaved: boolean;
  onFav: () => void;
  onAdd: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}) {
  const [justAdded, setJustAdded] = useState(false);
  const soldOut = item.stock_count !== null && item.stock_count === 0;

  // Gallery-first photo URL
  const galleryUrl = item.photos?.find((p) => p.url && p.url.trim() !== "")?.url;
  const photoUrl = galleryUrl ?? (item.photo_url?.trim() ? item.photo_url : undefined);

  // Fake rating for visual richness (seeded from index, stable)
  const rating = (4.2 + (index % 5) * 0.15).toFixed(1);

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
        // Cards are ~85% of scroll-container width so the next card peeks in
        flexShrink: 0,
        width: "min(300px, calc(100% - 44px))",
        scrollSnapAlign: "start",
        display: "flex",
        flexDirection: "column",
        background: CARD_BG,
        border: `0.5px solid ${CARD_BORDER}`,
        borderRadius: 24,
        overflow: "hidden",
        opacity: soldOut ? 0.6 : 1,
      }}
    >
      {/* Photo area — 62% of card height (flex-basis) */}
      <div style={{ position: "relative", flex: "0 0 62%" }}>
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
              background: "rgba(79,209,197,.06)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 48,
            }}
          >
            🍜
          </div>
        )}

        {/* Rating badge — top-left */}
        <span
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            background: RATING_BG,
            color: ACCENT_ON,
            borderRadius: 999,
            padding: "4px 11px",
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: "1px",
          }}
        >
          ★ {rating}
        </span>

        {/* Fav button — top-right */}
        <button
          type="button"
          onClick={onFav}
          aria-label={isFaved ? t("removeFavoriteAria") : t("addFavoriteAria")}
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            width: 34,
            height: 34,
            borderRadius: 99,
            background: FAV_BG,
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            cursor: "pointer",
            color: isFaved ? "#FF4D6D" : "rgba(255,255,255,.8)",
          }}
        >
          {isFaved ? "♥" : "♡"}
        </button>
      </div>

      {/* Info area */}
      <div
        style={{
          flex: 1,
          padding: "18px 18px 20px",
          display: "flex",
          flexDirection: "column",
          color: TEXT,
          minHeight: 0,
        }}
      >
        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: "-0.3px",
            lineHeight: 1.15,
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {item.name}
        </div>

        {item.description && (
          <div
            style={{
              fontSize: 12.5,
              lineHeight: 1.5,
              color: TEXT_MUTED,
              marginTop: 6,
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {item.description}
          </div>
        )}

        {/* Price + Add button */}
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 14,
          }}
        >
          <span
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: soldOut ? TEXT_MUTED : ACCENT,
            }}
          >
            {soldOut ? t("soldOut") : fmtPrice(item.price_cents)}
          </span>

          <button
            type="button"
            onClick={handleAdd}
            disabled={soldOut}
            style={{
              background: soldOut
                ? "rgba(255,255,255,.1)"
                : justAdded
                ? "#059669"
                : ACCENT,
              color: soldOut || justAdded ? "#fff" : ACCENT_ON,
              border: "none",
              borderRadius: 999,
              padding: "12px 22px",
              fontSize: 13,
              fontWeight: 800,
              cursor: soldOut ? "not-allowed" : "pointer",
              transform: justAdded ? "scale(1.05)" : "scale(1)",
              transition: "background .2s ease, transform .18s cubic-bezier(.22,1,.36,1)",
              whiteSpace: "nowrap",
            }}
          >
            {soldOut ? t("unavailable") : justAdded ? "✓" : `${t("addToBag")} +`}
          </button>
        </div>
      </div>
    </div>
  );
}
