"use client";

/**
 * #39 Full-Bleed Swipe — board-faithful port ("COAST" beachside seafood)
 *
 * Each menu item fills the entire viewport — a full-bleed photo card that
 * you snap-scroll horizontally. Category chips at the top switch pools.
 * A dot pager + item-counter shows position. One big "Add" CTA per card.
 *
 * BG: #0A1628 (deep ocean) · Accent: #14B8A6 (teal) · Text: #FFFFFF
 *
 * Critical fixes:
 *  • gallery-first photo URL
 *  • height: var(--menu-vh, 100dvh) on the whole container
 *  • env(safe-area-inset-bottom) in CTA
 *  • own cart bar → suppressedTemplates
 *  • own header → showBusinessHeader exclusion
 */

import { useRef, useState, useCallback } from "react";
import { IconShoppingBag } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { fmtPrice } from "./shared/format";
import type { MenuTemplateProps } from "./types";
import type { PublicMenuItem } from "../page";

const BG = "#0A1628";
const SURFACE = "#112240";
const ACCENT = "#14B8A6"; // teal
const ACCENT_ON = "#FFFFFF";
const CHIP_BG = "rgba(20,184,166,.12)";
const CHIP_TEXT = "#14B8A6";
const CHIP_ACTIVE_BG = "#14B8A6";
const CHIP_ACTIVE_TEXT = "#0A1628";
const CARD_GRAD = "linear-gradient(to top, rgba(10,22,40,.98) 0%, rgba(10,22,40,.65) 40%, rgba(10,22,40,0) 68%)";

export default function FullBleedSwipe({
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
  const [cardIdx, setCardIdx] = useState(0);
  const [favIds, setFavIds] = useState<Set<string>>(new Set());
  const [justAdded, setJustAdded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const currentCat = categories.find((c) => c.id === activeCat) ?? categories[0];
  const items = currentCat?.items ?? [];
  const activeItem = items[cardIdx] as PublicMenuItem | undefined;

  const toggleFav = useCallback((id: string) => {
    setFavIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);

  const handleCat = (catId: string) => {
    setActiveCat(catId);
    setCardIdx(0);
    setJustAdded(false);
    scrollToCategory(catId);
    scrollRef.current?.scrollTo({ left: 0, behavior: "instant" });
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const newIdx = Math.round(el.scrollLeft / w);
    if (newIdx !== cardIdx) { setCardIdx(newIdx); setJustAdded(false); }
  };

  const handleAdd = () => {
    if (!activeItem || (activeItem.stock_count !== null && activeItem.stock_count === 0)) return;
    onItemAdd(activeItem);
    if (!activeItem.groups.length) { setJustAdded(true); setTimeout(() => setJustAdded(false), 1100); }
  };

  const soldOut = activeItem ? (activeItem.stock_count !== null && activeItem.stock_count === 0) : false;

  return (
    <div
      style={{
        position: "relative",
        height: "var(--menu-vh, 100dvh)",
        background: BG,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Header ────────────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          paddingTop: "max(14px, env(safe-area-inset-top, 0px))",
          background: "linear-gradient(to bottom, rgba(10,22,40,.85) 0%, rgba(10,22,40,0) 100%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px 6px" }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", letterSpacing: "-0.3px" }}>{business.name}</div>
            <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "2.5px", color: ACCENT, textTransform: "uppercase" }}>{business.category ?? "Menu"}</div>
          </div>
          <button
            type="button"
            onClick={onOpenCart}
            aria-label={t("openCartAria")}
            style={{
              position: "relative",
              width: 38, height: 38, borderRadius: 99,
              background: "rgba(255,255,255,.12)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              border: "0.5px solid rgba(255,255,255,.2)",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
            }}
          >
            <IconShoppingBag size={18} color="#fff" />
            {cartCount > 0 && (
              <span style={{ position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 99, background: ACCENT, color: CHIP_ACTIVE_TEXT, fontSize: 10, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", paddingInline: 4 }}>
                {cartCount}
              </span>
            )}
          </button>
        </div>

        {/* Category chips */}
        <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "0 20px 6px", scrollbarWidth: "none" }}>
          {categories.map((cat) => {
            const isActive = activeCat === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleCat(cat.id)}
                style={{
                  flexShrink: 0, fontSize: 11, fontWeight: 700, padding: "5px 13px", borderRadius: 99, border: "none", cursor: "pointer",
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

      {/* ── Full-bleed snap scroll ─────────────────────────────────── */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          display: "flex",
          flex: 1,
          overflowX: "auto",
          overflowY: "hidden",
          scrollSnapType: "x mandatory",
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {items.map((item) => {
          const galleryUrl = item.photos?.find((p) => p.url && p.url.trim() !== "")?.url;
          const photoUrl = galleryUrl ?? (item.photo_url?.trim() ? item.photo_url : undefined);
          const isFaved = favIds.has(item.id);

          return (
            <div
              key={item.id}
              style={{
                flexShrink: 0,
                width: "100vw",
                height: "100%",
                scrollSnapAlign: "start",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Photo */}
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl} alt={item.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{ position: "absolute", inset: 0, background: SURFACE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 90 }}>🐟</div>
              )}

              {/* Gradient bottom */}
              <div style={{ position: "absolute", inset: 0, background: CARD_GRAD }} />

              {/* Fav */}
              <button
                type="button"
                onClick={() => toggleFav(item.id)}
                aria-label={isFaved ? t("removeFavoriteAria") : t("addFavoriteAria")}
                style={{
                  position: "absolute", top: "max(80px, env(safe-area-inset-top, 0px))", right: 20,
                  width: 38, height: 38, borderRadius: 99,
                  background: "rgba(255,255,255,.12)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
                  border: "0.5px solid rgba(255,255,255,.2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, cursor: "pointer", color: isFaved ? "#FF4D6D" : "#fff",
                }}
              >
                {isFaved ? "♥" : "♡"}
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Bottom panel: item info + CTA ─────────────────────────── */}
      {activeItem && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 20,
            padding: `16px 24px calc(20px + env(safe-area-inset-bottom, 0px))`,
            background: "linear-gradient(to top, rgba(10,22,40,1) 0%, rgba(10,22,40,.85) 70%, rgba(10,22,40,0) 100%)",
            paddingTop: 40,
          }}
        >
          {/* Counter */}
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "2px", color: ACCENT, marginBottom: 6 }}>
            {cardIdx + 1} / {items.length}
          </div>

          <div style={{ fontSize: 26, fontWeight: 900, color: "#fff", lineHeight: 1.05, letterSpacing: "-0.5px", marginBottom: 4 }}>
            {activeItem.name}
          </div>
          {activeItem.description && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.7)", lineHeight: 1.5, marginBottom: 10, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
              {activeItem.description}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: ACCENT, flexShrink: 0 }}>
              {soldOut ? t("soldOut") : fmtPrice(activeItem.price_cents)}
            </div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={soldOut}
              style={{
                flex: 1,
                background: soldOut ? "rgba(255,255,255,.18)" : justAdded ? "#059669" : ACCENT,
                color: soldOut ? "#fff" : CHIP_ACTIVE_TEXT,
                border: "none",
                borderRadius: 14,
                padding: "14px",
                fontSize: 15,
                fontWeight: 900,
                cursor: soldOut ? "not-allowed" : "pointer",
                transition: "background .2s ease, transform .18s cubic-bezier(.22,1,.36,1)",
                transform: justAdded ? "scale(1.03)" : "scale(1)",
              }}
            >
              {justAdded ? "✓ Added" : soldOut ? t("soldOut") : `+ ${t("addToCart")}`}
            </button>
          </div>

          {/* Dot pager */}
          {items.length > 1 && (
            <div style={{ display: "flex", gap: 5, justifyContent: "center", marginTop: 14 }}>
              {items.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => { scrollRef.current?.scrollTo({ left: i * (scrollRef.current?.clientWidth ?? 0), behavior: "smooth" }); setCardIdx(i); setJustAdded(false); }}
                  style={{
                    width: i === cardIdx ? 20 : 6, height: 6, borderRadius: 99, border: "none", padding: 0,
                    background: i === cardIdx ? ACCENT : "rgba(255,255,255,.25)",
                    cursor: "pointer",
                    transition: "width .25s ease, background .2s ease",
                  }}
                />
              ))}
            </div>
          )}

          {/* Cart pill */}
          {cartCount > 0 && (
            <button
              type="button"
              onClick={onOpenCart}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                width: "100%", marginTop: 10,
                background: "rgba(255,255,255,.1)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
                border: "0.5px solid rgba(255,255,255,.2)", borderRadius: 12, padding: "10px 16px",
                cursor: "pointer", color: "#fff", fontSize: 13, fontWeight: 700,
              }}
            >
              <span><IconShoppingBag size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />{cartCount} {cartCount === 1 ? t("item") : t("items")}</span>
              <span>{fmtPrice(cartTotal)} →</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
