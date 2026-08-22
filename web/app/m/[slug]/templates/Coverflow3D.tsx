"use client";

/**
 * #41 Coverflow 3D — board-faithful port ("VINYL" cocktail bar & music venue)
 *
 * iTunes-era coverflow: the active card faces forward while flanking cards
 * rotate in perspective, giving a satisfying 3D deck feel. Navigate with
 * the ‹ › arrows or tap a side card to bring it to the front.
 *
 * BG: #0C0C14 (near-black indigo) · Accent: #8B5CF6 (purple) · Text: #FFFFFF
 *
 * Critical fixes:
 *  • gallery-first photo URL
 *  • var(--menu-vh, 100dvh)
 *  • env(safe-area-inset-bottom) in cart bar
 *  • own cart bar → suppressedTemplates
 *  • own header → showBusinessHeader exclusion
 */

import { useMemo, useState, useCallback } from "react";
import { IconShoppingBag } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { fmtPrice } from "./shared/format";
import type { MenuTemplateProps } from "./types";
import type { PublicMenuItem } from "../page";

const BG = "#0C0C14";
const SURFACE = "#16162A";
const ACCENT = "#8B5CF6"; // purple
const ACCENT_ON = "#FFFFFF";
const CHIP_BG = "rgba(139,92,246,.12)";
const CHIP_TEXT = "#8B5CF6";
const CHIP_ACTIVE_BG = "#8B5CF6";
const CHIP_ACTIVE_TEXT = "#fff";
const GRAD = "linear-gradient(to top, rgba(12,12,20,.96) 0%, rgba(12,12,20,.4) 55%, rgba(12,12,20,0) 80%)";

// How much to rotate the off-center cards (degrees)
const SIDE_ANGLE = 48;
// How much to scale down the side cards
const SIDE_SCALE = 0.7;
// How much to translate the side cards laterally (px)
const SIDE_TX = 58;

export default function Coverflow3D({
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
  const [justAdded, setJustAdded] = useState(false);
  const [favIds, setFavIds] = useState<Set<string>>(new Set());

  const currentCat = categories.find((c) => c.id === activeCat) ?? categories[0];
  const items: PublicMenuItem[] = useMemo(() => currentCat?.items ?? [], [currentCat]);
  const [idx, setIdx] = useState(0);

  const active = items[idx] as PublicMenuItem | undefined;

  const toggleFav = useCallback((id: string) => {
    setFavIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const goTo = (i: number) => {
    const next = Math.max(0, Math.min(items.length - 1, i));
    if (next !== idx) { setIdx(next); setJustAdded(false); }
  };

  const handleAdd = () => {
    if (!active || (active.stock_count !== null && active.stock_count === 0)) return;
    onItemAdd(active);
    if (!active.groups.length) { setJustAdded(true); setTimeout(() => setJustAdded(false), 1100); }
  };

  const handleCat = (catId: string) => {
    setActiveCat(catId);
    setIdx(0);
    setJustAdded(false);
    scrollToCategory(catId);
  };

  const heroSoldOut = active ? (active.stock_count !== null && active.stock_count === 0) : false;

  // Build the visible "cover" slots: indices from idx-2 to idx+2
  const VISIBLE = 2; // how many side cards to show on each side
  const slots = Array.from({ length: VISIBLE * 2 + 1 }, (_, i) => idx - VISIBLE + i);

  const getPhotoUrl = (item: PublicMenuItem) => {
    const g = item.photos?.find((p) => p.url && p.url.trim() !== "")?.url;
    return g ?? (item.photo_url?.trim() ? item.photo_url : undefined);
  };

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
          flexShrink: 0,
          paddingTop: "max(16px, env(safe-area-inset-top, 0px))",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "4px 22px 0",
          }}
        >
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.5px", color: "#fff" }}>
              {business.name}
            </div>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "2px", color: ACCENT, marginTop: 2 }}>
              {(business.category ?? "MENU").toUpperCase()}
            </div>
          </div>

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
              border: "0.5px solid rgba(255,255,255,.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <IconShoppingBag size={18} color={ACCENT} />
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
                onClick={() => handleCat(cat.id)}
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

      {/* ── 3D Coverflow stage ────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          perspective: "800px",
          perspectiveOrigin: "50% 40%",
          overflow: "hidden",
        }}
      >
        {/* Cover cards */}
        {items.length > 0 && (
          <div
            style={{
              position: "relative",
              width: "100%",
              height: 280,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transformStyle: "preserve-3d",
            }}
          >
            {slots.map((slotIdx) => {
              const item = items[slotIdx] as PublicMenuItem | undefined;
              if (!item) return null;

              const offset = slotIdx - idx; // -2 to +2
              const absOffset = Math.abs(offset);
              const isCenter = offset === 0;
              const isLeft = offset < 0;

              const rotateY = isCenter ? 0 : isLeft ? SIDE_ANGLE : -SIDE_ANGLE;
              const translateX = offset * SIDE_TX;
              const scale = isCenter ? 1 : SIDE_SCALE - (absOffset - 1) * 0.06;
              const zIndex = 10 - absOffset;
              const opacity = absOffset > 2 ? 0 : 1 - absOffset * 0.15;

              const photoUrl = getPhotoUrl(item);

              return (
                <div
                  key={item.id}
                  onClick={() => goTo(slotIdx)}
                  style={{
                    position: "absolute",
                    width: 220,
                    height: 280,
                    borderRadius: 18,
                    overflow: "hidden",
                    cursor: isCenter ? "default" : "pointer",
                    zIndex,
                    opacity,
                    transform: `translateX(${translateX}px) rotateY(${rotateY}deg) scale(${scale})`,
                    transition: "transform .35s cubic-bezier(.25,.8,.25,1), opacity .35s ease",
                    boxShadow: isCenter ? "0 20px 60px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.08)" : "0 10px 30px rgba(0,0,0,.5)",
                    willChange: "transform",
                  }}
                >
                  {photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoUrl}
                      alt={item.name}
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                  ) : (
                    <div style={{ width: "100%", height: "100%", background: SURFACE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 60 }}>🎵</div>
                  )}

                  {/* Gradient overlay (center card only) */}
                  {isCenter && (
                    <div style={{ position: "absolute", inset: 0, background: GRAD }} />
                  )}

                  {/* Reflection */}
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "linear-gradient(160deg, rgba(255,255,255,.04) 0%, rgba(255,255,255,0) 50%)",
                      pointerEvents: "none",
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Active item info */}
        {active && (
          <div
            style={{
              textAlign: "center",
              padding: "16px 32px 10px",
              color: "#fff",
              zIndex: 20,
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "2px", color: ACCENT, marginBottom: 6 }}>
              {idx + 1} / {items.length}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.3px", marginBottom: 4, lineHeight: 1.1 }}>
              {active.name}
            </div>
            {active.description && (
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,.65)",
                  lineHeight: 1.5,
                  overflow: "hidden",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  marginBottom: 8,
                }}
              >
                {active.description}
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18, marginTop: 4 }}>
              {/* Prev */}
              <button
                type="button"
                onClick={() => goTo(idx - 1)}
                disabled={idx === 0}
                aria-label={t("prevItemAria")}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 99,
                  background: "rgba(255,255,255,.08)",
                  border: "0.5px solid rgba(255,255,255,.18)",
                  color: "#fff",
                  fontSize: 20,
                  cursor: idx === 0 ? "not-allowed" : "pointer",
                  opacity: idx === 0 ? 0.35 : 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ‹
              </button>

              {/* Price + Add */}
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: ACCENT }}>
                  {heroSoldOut ? t("soldOut") : fmtPrice(active.price_cents)}
                </span>
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={heroSoldOut}
                  style={{
                    background: heroSoldOut ? "rgba(255,255,255,.15)" : justAdded ? "#059669" : ACCENT,
                    color: "#fff",
                    border: "none",
                    borderRadius: 12,
                    padding: "11px 24px",
                    fontSize: 14,
                    fontWeight: 800,
                    cursor: heroSoldOut ? "not-allowed" : "pointer",
                    transition: "background .2s ease, transform .18s cubic-bezier(.22,1,.36,1)",
                    transform: justAdded ? "scale(1.05)" : "scale(1)",
                  }}
                >
                  {justAdded ? "✓" : "+ Add"}
                </button>
              </div>

              {/* Next */}
              <button
                type="button"
                onClick={() => goTo(idx + 1)}
                disabled={idx === items.length - 1}
                aria-label={t("nextItemAria")}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 99,
                  background: "rgba(255,255,255,.08)",
                  border: "0.5px solid rgba(255,255,255,.18)",
                  color: "#fff",
                  fontSize: 20,
                  cursor: idx === items.length - 1 ? "not-allowed" : "pointer",
                  opacity: idx === items.length - 1 ? 0.35 : 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ›
              </button>
            </div>

            {/* Fav */}
            <button
              type="button"
              onClick={() => toggleFav(active.id)}
              style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: favIds.has(active.id) ? "#FF4D6D" : "rgba(255,255,255,.45)", marginTop: 6 }}
            >
              {favIds.has(active.id) ? "♥" : "♡"}
            </button>
          </div>
        )}

        {/* Dot pager */}
        <div style={{ display: "flex", gap: 6, marginTop: 4, justifyContent: "center" }}>
          {items.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              style={{
                width: i === idx ? 18 : 6,
                height: 6,
                borderRadius: 99,
                background: i === idx ? ACCENT : "rgba(255,255,255,.2)",
                border: "none",
                cursor: "pointer",
                padding: 0,
                transition: "width .25s ease, background .2s ease",
              }}
            />
          ))}
        </div>
      </div>

      {/* ── Cart bar ──────────────────────────────────────────────── */}
      {cartCount > 0 && (
        <button
          type="button"
          onClick={onOpenCart}
          style={{
            position: "absolute",
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
