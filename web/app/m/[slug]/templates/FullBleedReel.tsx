"use client";

/**
 * #21 Full-Bleed Reel — board-faithful port ("REEL & ROLL" street food)
 *
 * Each dish owns the entire screen: vertical snap-scroll like a video reel.
 * A thumb-side action rail (fav + add + share) overlaid on each frame.
 * Category chips sticky at top. Glass cart bar at bottom.
 *
 * Accent: #FF5A1F (fiery orange). Background: #000.
 *
 * Critical fixes:
 *  • gallery-first photo URL
 *  • var(--menu-vh, 100dvh) for full-height container
 *  • env(safe-area-inset-bottom) in cart bar
 *  • own cart bar → added to suppressedTemplates
 */

import { useCallback, useState } from "react";
import { IconShoppingBag } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { fmtPrice } from "./shared/format";
import type { MenuTemplateProps } from "./types";
import type { PublicMenuItem } from "../page";

const BG = "#000000";
const ACCENT = "#FF5A1F";
const CHIP_BG = "rgba(255,90,31,.15)";
const CHIP_TEXT = "#FF5A1F";
const CHIP_ACTIVE_BG = "#FF5A1F";
const CHIP_ACTIVE_TEXT = "#000";
const GRAD = "linear-gradient(to top, rgba(0,0,0,.85) 12%, rgba(0,0,0,0) 46%, rgba(0,0,0,.35))";

export default function FullBleedReel({
  business,
  categories,
  scrollToCategory,
  onItemAdd,
  cartCount,
  cartTotal,
  onOpenCart,
}: MenuTemplateProps) {
  const t = useTranslations("menu");
  const [activeCat, setActiveCat] = useState(categories[0]?.id ?? "");
  const [favIds, setFavIds] = useState<Set<string>>(new Set());

  const toggleFav = useCallback((id: string) => {
    setFavIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleCatClick = useCallback(
    (catId: string) => {
      setActiveCat(catId);
      scrollToCategory(catId);
    },
    [scrollToCategory]
  );

  const currentCat = categories.find((c) => c.id === activeCat) ?? categories[0];
  const items = currentCat?.items ?? [];

  return (
    <div
      style={{
        position: "relative",
        height: "var(--menu-vh, 100dvh)",
        background: BG,
        overflow: "hidden",
      }}
    >
      {/* ── Category chips (sticky over the reel) ─────────────────────── */}
      <div
        style={{
          position: "absolute",
          top: "max(48px, calc(env(safe-area-inset-top, 0px) + 8px))",
          left: 0,
          right: 0,
          zIndex: 20,
          display: "flex",
          gap: 8,
          overflowX: "auto",
          padding: "6px 16px",
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
                fontSize: 11,
                fontWeight: 700,
                padding: "5px 13px",
                borderRadius: 99,
                border: "none",
                cursor: "pointer",
                background: isActive ? CHIP_ACTIVE_BG : CHIP_BG,
                color: isActive ? CHIP_ACTIVE_TEXT : CHIP_TEXT,
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                transition: "background .2s ease, color .2s ease",
              }}
            >
              {cat.name}
            </button>
          );
        })}
      </div>

      {/* ── Vertical snap-scroll reel ─────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          overflowY: "auto",
          overflowX: "hidden",
          scrollSnapType: "y mandatory",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {items.map((item, i) => (
          <ReelFrame
            key={item.id}
            item={item}
            index={i}
            isFaved={favIds.has(item.id)}
            onFav={() => toggleFav(item.id)}
            onAdd={() => onItemAdd(item)}
            t={t}
          />
        ))}
        {/* Bottom padding frame so last item isn't hidden behind cart bar */}
        <div
          style={{
            height: "calc(74px + env(safe-area-inset-bottom, 0px))",
            scrollSnapAlign: "none",
            flexShrink: 0,
          }}
        />
      </div>

      {/* ── Glass cart bar ────────────────────────────────────────────── */}
      {cartCount > 0 && (
        <button
          type="button"
          onClick={onOpenCart}
          style={{
            position: "absolute",
            left: 16,
            right: 16,
            bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
            background: "rgba(20,20,20,.72)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            border: "0.5px solid rgba(255,255,255,.18)",
            borderRadius: 16,
            padding: "13px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            zIndex: 30,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", gap: 8 }}>
            <IconShoppingBag size={16} color="#fff" />
            {cartCount} {cartCount === 1 ? t("item") : t("items")}
          </span>
          <span style={{ fontSize: 13, fontWeight: 800, color: ACCENT }}>
            {fmtPrice(cartTotal)} →
          </span>
        </button>
      )}
    </div>
  );
}

// ── One full-screen reel frame ────────────────────────────────────────────────
function ReelFrame({
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

  const handleAdd = () => {
    if (soldOut) return;
    onAdd();
    if (!item.groups.length) {
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 1100);
    }
  };

  // Fake rating seeded by index
  const rating = (4.1 + (index % 6) * 0.15).toFixed(1);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "var(--menu-vh, 100dvh)",
        scrollSnapAlign: "start",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      {/* Background photo */}
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
            background: "#111",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 72,
          }}
        >
          🍔
        </div>
      )}

      {/* Gradient overlay */}
      <div style={{ position: "absolute", inset: 0, background: GRAD }} />

      {/* Info — bottom-left, clear of action rail */}
      <div
        style={{
          position: "absolute",
          left: 22,
          right: 96,
          bottom: 96,
          color: "#fff",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: "2px",
            color: ACCENT,
          }}
        >
          ★ {rating}
        </div>
        <div
          style={{
            fontSize: 30,
            fontWeight: 700,
            letterSpacing: "-0.6px",
            lineHeight: 1.05,
            margin: "6px 0 8px",
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
              lineHeight: 1.45,
              color: "rgba(255,255,255,.75)",
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
        <div style={{ fontSize: 22, fontWeight: 800, marginTop: 10 }}>
          {soldOut ? t("soldOut") : fmtPrice(item.price_cents)}
        </div>
      </div>

      {/* Action rail — right side */}
      <div
        style={{
          position: "absolute",
          right: 16,
          bottom: 108,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 22,
        }}
      >
        {/* Fav */}
        <button
          type="button"
          onClick={onFav}
          aria-label={isFaved ? t("removeFavoriteAria") : t("addFavoriteAria")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 27,
            lineHeight: 1,
            padding: 0,
            color: isFaved ? "#FF4D6D" : "#fff",
            filter: "drop-shadow(0 2px 4px rgba(0,0,0,.4))",
          }}
        >
          {isFaved ? "♥" : "♡"}
        </button>

        {/* Add button */}
        <button
          type="button"
          onClick={handleAdd}
          disabled={soldOut}
          aria-label={t("addToCartAria")}
          style={{
            width: 56,
            height: 56,
            borderRadius: 99,
            background: soldOut ? "rgba(255,255,255,.2)" : justAdded ? "#059669" : ACCENT,
            color: "#fff",
            border: "3px solid rgba(255,255,255,.85)",
            fontSize: 26,
            fontWeight: 300,
            cursor: soldOut ? "not-allowed" : "pointer",
            boxShadow: soldOut || justAdded ? "none" : "0 8px 20px rgba(255,90,31,.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: justAdded ? "scale(1.1)" : "scale(1)",
            transition: "background .2s ease, transform .18s cubic-bezier(.22,1,.36,1)",
          }}
        >
          {justAdded ? "✓" : "+"}
        </button>

        {/* Share placeholder */}
        <span style={{ fontSize: 22, color: "#fff", opacity: 0.9, lineHeight: 1 }}>↗</span>
      </div>
    </div>
  );
}
