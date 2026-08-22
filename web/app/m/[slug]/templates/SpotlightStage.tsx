"use client";

/**
 * #33 Spotlight Stage — board-faithful port ("Menya" ramen bar & izakaya)
 *
 * One dish takes the stage in a big framed hero while the rest wait in a
 * ticker rail below. Tap any card in the rail and it slides into the spotlight.
 * A lean-back way to browse that keeps the photo huge.
 *
 * BG: #120D0A · Accent: #E8A23D (amber) · Text: #fff
 *
 * Critical fixes:
 *  • gallery-first photo URL
 *  • var(--menu-vh, 100dvh)
 *  • env(safe-area-inset-bottom) in cart bar
 *  • own cart bar → suppressedTemplates
 *  • own header → showBusinessHeader exclusion
 */

import { useCallback, useMemo, useState } from "react";
import { IconShoppingBag } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { fmtPrice } from "./shared/format";
import type { MenuTemplateProps } from "./types";
import type { PublicMenuItem } from "../page";

const BG = "#120D0A";
const SURFACE = "#211812";
const ACCENT = "#E8A23D"; // amber/gold
const ACCENT_ON = "#120D0A";
const CHIP_BG = "rgba(232,162,61,.12)";
const CHIP_TEXT = "#E8A23D";
const CHIP_ACTIVE_BG = "#E8A23D";
const CHIP_ACTIVE_TEXT = "#120D0A";
const GRAD = "linear-gradient(to top, rgba(18,13,10,.94) 6%, rgba(18,13,10,0) 52%)";

export default function SpotlightStage({
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
  const [justAdded, setJustAdded] = useState(false);

  const currentCat = categories.find((c) => c.id === activeCat) ?? categories[0];
  const items = useMemo(() => currentCat?.items ?? [], [currentCat]);
  const [heroIdx, setHeroIdx] = useState(0);

  const hero = items[heroIdx] as PublicMenuItem | undefined;

  const toggleFav = useCallback((id: string) => {
    setFavIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleCatClick = (catId: string) => {
    setActiveCat(catId);
    setHeroIdx(0);
    setJustAdded(false);
    scrollToCategory(catId);
  };

  const goNext = () => { setHeroIdx((i) => (i + 1) % items.length); setJustAdded(false); };
  const goPrev = () => { setHeroIdx((i) => (i - 1 + items.length) % items.length); setJustAdded(false); };

  const handleAdd = () => {
    if (!hero || hero.stock_count === 0) return;
    onItemAdd(hero);
    if (!hero.groups.length) {
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 1100);
    }
  };

  const heroGallery = hero?.photos?.find((p) => p.url && p.url.trim() !== "")?.url;
  const heroPhoto = heroGallery ?? (hero?.photo_url?.trim() ? hero.photo_url : undefined);
  const heroSoldOut = hero ? (hero.stock_count !== null && hero.stock_count === 0) : false;
  const heroRating = (4.1 + (heroIdx % 6) * 0.15).toFixed(1);

  if (!hero) {
    return (
      <div style={{ height: "var(--menu-vh, 100dvh)", background: BG, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
        {t("noItems")}
      </div>
    );
  }

  return (
    <div
      style={{
        position: "relative",
        height: "var(--menu-vh, 100dvh)",
        background: BG,
        overflow: "hidden",
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          paddingTop: "max(16px, env(safe-area-inset-top, 0px))",
          zIndex: 10,
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
            <div style={{ fontSize: 23, fontWeight: 800, letterSpacing: "-0.5px", color: "#fff" }}>
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
                  transition: "background .18s ease, color .18s ease",
                }}
              >
                {cat.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Hero frame ─────────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          top: 150,
          left: 16,
          right: 16,
          height: 358,
          borderRadius: 22,
          overflow: "hidden",
          boxShadow: "0 18px 40px rgba(0,0,0,.5)",
        }}
      >
        {heroPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroPhoto}
            alt={hero.name}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div style={{ position: "absolute", inset: 0, background: "#211812", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 72 }}>🍜</div>
        )}
        <div style={{ position: "absolute", inset: 0, background: GRAD }} />

        {/* Fav — top-right */}
        <button
          type="button"
          onClick={() => toggleFav(hero.id)}
          aria-label={favIds.has(hero.id) ? t("removeFavoriteAria") : t("addFavoriteAria")}
          style={{ position: "absolute", top: 14, right: 16, background: "none", border: "none", fontSize: 20, cursor: "pointer", color: favIds.has(hero.id) ? "#FF4D6D" : "#fff" }}
        >
          {favIds.has(hero.id) ? "♥" : "♡"}
        </button>

        {/* Arrows */}
        {items.length > 1 && (
          <>
            <button
              type="button"
              onClick={goPrev}
              aria-label={t("prevItemAria")}
              style={{
                position: "absolute", left: 12, top: 158,
                width: 40, height: 40, borderRadius: 99,
                background: "rgba(0,0,0,.42)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
                border: "0.5px solid rgba(255,255,255,.28)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontSize: 20, cursor: "pointer",
              }}
            >
              ‹
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label={t("nextItemAria")}
              style={{
                position: "absolute", right: 12, top: 158,
                width: 40, height: 40, borderRadius: 99,
                background: "rgba(0,0,0,.42)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
                border: "0.5px solid rgba(255,255,255,.28)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontSize: 20, cursor: "pointer",
              }}
            >
              ›
            </button>
          </>
        )}

        {/* Hero info — bottom */}
        <div style={{ position: "absolute", left: 18, right: 18, bottom: 18, color: "#fff" }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "2px", color: ACCENT }}>
            ★ {heroRating} · {heroIdx + 1} / {items.length}
          </div>
          <div
            style={{
              fontSize: 26, fontWeight: 800, letterSpacing: "-0.5px", margin: "5px 0 6px",
              overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box",
              WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
            }}
          >
            {hero.name}
          </div>
          {hero.description && (
            <div
              style={{
                fontSize: 12, lineHeight: 1.5, color: "rgba(255,255,255,.72)",
                overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box",
                WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
              }}
            >
              {hero.description}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
            <span style={{ fontSize: 22, fontWeight: 800 }}>
              {heroSoldOut ? t("soldOut") : fmtPrice(hero.price_cents)}
            </span>
            <button
              type="button"
              onClick={handleAdd}
              disabled={heroSoldOut}
              style={{
                background: heroSoldOut ? "rgba(255,255,255,.2)" : justAdded ? "#059669" : ACCENT,
                color: heroSoldOut || justAdded ? "#fff" : ACCENT_ON,
                border: "none",
                borderRadius: 12,
                padding: "12px 26px",
                fontSize: 14,
                fontWeight: 800,
                cursor: heroSoldOut ? "not-allowed" : "pointer",
                transform: justAdded ? "scale(1.03)" : "scale(1)",
                transition: "background .2s ease, transform .18s cubic-bezier(.22,1,.36,1)",
              }}
            >
              {justAdded ? "✓ Added" : "Add +"}
            </button>
          </div>
        </div>
      </div>

      {/* ── "UP NEXT" label ─────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          left: 22,
          top: 524,
          fontSize: 10,
          fontWeight: 900,
          letterSpacing: "2px",
          color: "rgba(255,255,255,.4)",
          zIndex: 5,
        }}
      >
        UP NEXT
      </div>

      {/* ── Ticker rail ─────────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 542,
          bottom: "calc(80px + env(safe-area-inset-bottom, 0px))",
          display: "flex",
          gap: 12,
          overflowX: "auto",
          padding: "0 16px",
          scrollbarWidth: "none",
          alignItems: "stretch",
        }}
      >
        {items.map((item, i) => {
          const gUrl = item.photos?.find((p) => p.url && p.url.trim() !== "")?.url;
          const src = gUrl ?? (item.photo_url?.trim() ? item.photo_url : undefined);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => { setHeroIdx(i); setJustAdded(false); }}
              style={{
                flexShrink: 0,
                width: 140,
                background: SURFACE,
                borderRadius: 16,
                overflow: "hidden",
                cursor: "pointer",
                border: i === heroIdx ? `1.5px solid ${ACCENT}` : "1.5px solid transparent",
                padding: 0,
                transition: "border-color .2s ease",
              }}
            >
              <div style={{ position: "relative", height: 104 }}>
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt={item.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ position: "absolute", inset: 0, background: "#2A1F18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>🍜</div>
                )}
                {/* Add button on card */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onItemAdd(item); }}
                  style={{
                    position: "absolute", right: 6, bottom: 6,
                    width: 28, height: 28, borderRadius: 99,
                    background: ACCENT, color: ACCENT_ON,
                    border: "none", fontSize: 16, fontWeight: 400,
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  +
                </button>
              </div>
              <div style={{ padding: "8px 10px 10px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {item.name}
                </div>
                <div style={{ fontSize: 12, fontWeight: 800, color: ACCENT, marginTop: 2 }}>
                  {fmtPrice(item.price_cents)}
                </div>
              </div>
            </button>
          );
        })}
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
