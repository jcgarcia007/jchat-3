"use client";

/**
 * #38 Radial Fan — board-faithful port ("CARTA" modern tapas)
 *
 * Categories are displayed as petal-shaped chips fanned out in a semicircular
 * arc at the top of the screen. Tapping a category expands that petal and
 * slides the items list below. Items are shown as warm stacked cards.
 *
 * BG: #1A0F04 (dark espresso) · Accent: #F59E0B (amber) · Text: #FDF6EC
 *
 * Critical fixes:
 *  • gallery-first photo URL
 *  • var(--menu-vh, 100dvh)
 *  • env(safe-area-inset-bottom) in cart bar
 *  • own cart bar → suppressedTemplates
 *  • own header → showBusinessHeader exclusion
 *  • section refs + scrollMarginTop: 56
 */

import { useCallback, useMemo, useState } from "react";
import { IconShoppingBag } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { fmtPrice } from "./shared/format";
import type { MenuTemplateProps } from "./types";
import type { PublicMenuItem } from "../page";

const BG = "#1A0F04";
const SURFACE = "#241606";
const ACCENT = "#F59E0B"; // amber
const ACCENT_ON = "#1A0F04";
const TEXT = "#FDF6EC";
const MUTED = "rgba(253,246,236,.6)";
const FAINT = "rgba(253,246,236,.3)";
const BORDER = "rgba(245,158,11,.2)";
const CARD_BG = "#2A1A08";
const CARD_BORDER = "rgba(245,158,11,.15)";

// Fan constants
const FAN_RADIUS = 140; // px from center point
const FAN_CENTER_X = 0; // relative to container center
const FAN_START_DEG = -60; // leftmost petal
const FAN_END_DEG = 60; // rightmost petal

function fanAngle(i: number, total: number): number {
  if (total <= 1) return 0;
  return FAN_START_DEG + (i / (total - 1)) * (FAN_END_DEG - FAN_START_DEG);
}

export default function RadialFan({
  business,
  categories,
  scrollToCategory,
  sectionRefs,
  onItemAdd,
  cartCount,
  cartTotal,
  onOpenCart,
}: MenuTemplateProps) {
  const t = useTranslations("menu");
  const [activeCat, setActiveCat] = useState(categories[0]?.id ?? "");
  const [favIds, setFavIds] = useState<Set<string>>(new Set());

  const toggleFav = useCallback((id: string) => {
    setFavIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);

  const currentCat = useMemo(
    () => categories.find((c) => c.id === activeCat) ?? categories[0],
    [categories, activeCat]
  );

  const handlePetal = (catId: string) => {
    setActiveCat(catId);
    scrollToCategory(catId);
  };

  const total = categories.length;

  return (
    <div style={{ position: "relative", height: "var(--menu-vh, 100dvh)", background: BG, display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* ── Header bar ────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, paddingTop: "max(16px, env(safe-area-inset-top, 0px))", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "max(16px, env(safe-area-inset-top, 0px)) 22px 0" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: TEXT, letterSpacing: "-0.3px" }}>{business.name}</div>
          <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "2.5px", color: ACCENT, textTransform: "uppercase" }}>{business.category ?? "Menu"}</div>
        </div>
        <button type="button" onClick={onOpenCart} aria-label={t("openCartAria")}
          style={{ position: "relative", width: 38, height: 38, borderRadius: 99, background: SURFACE, border: `0.5px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
        >
          <IconShoppingBag size={18} color={ACCENT} />
          {cartCount > 0 && (
            <span style={{ position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 99, background: ACCENT, color: ACCENT_ON, fontSize: 10, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", paddingInline: 4 }}>{cartCount}</span>
          )}
        </button>
      </div>

      {/* ── Radial Fan ────────────────────────────────────────────── */}
      <div
        style={{
          flexShrink: 0,
          height: FAN_RADIUS + 80,
          position: "relative",
          overflow: "visible",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
        }}
      >
        {/* Center pivot point visual */}
        <div
          style={{
            position: "absolute",
            bottom: -6,
            left: "50%",
            transform: "translateX(-50%)",
            width: 12,
            height: 12,
            borderRadius: 99,
            background: ACCENT,
            boxShadow: `0 0 12px ${ACCENT}`,
            zIndex: 5,
          }}
        />

        {categories.map((cat, i) => {
          const angleDeg = fanAngle(i, total);
          const angleRad = (angleDeg * Math.PI) / 180;
          const isActive = cat.id === activeCat;

          // Petal position relative to pivot at bottom-center
          const x = Math.sin(angleRad) * FAN_RADIUS;
          const y = -Math.cos(angleRad) * FAN_RADIUS;

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => handlePetal(cat.id)}
              style={{
                position: "absolute",
                bottom: 10,
                left: "50%",
                // Translate to fan position then up for the petal
                transform: `translate(calc(-50% + ${x}px), ${y}px) rotate(${angleDeg}deg)`,
                transformOrigin: "50% 100%",
                width: isActive ? 68 : 56,
                height: isActive ? 86 : 72,
                borderRadius: "50% 50% 30% 30% / 60% 60% 40% 40%",
                background: isActive
                  ? ACCENT
                  : `linear-gradient(to top, ${SURFACE}, #3A2510)`,
                border: isActive ? "none" : `0.5px solid ${CARD_BORDER}`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "flex-start",
                paddingTop: 8,
                cursor: "pointer",
                zIndex: isActive ? total + 1 : total - i,
                boxShadow: isActive
                  ? `0 0 20px rgba(245,158,11,.4), 0 8px 24px rgba(0,0,0,.5)`
                  : "0 4px 12px rgba(0,0,0,.4)",
                transition: "width .25s ease, height .25s ease, background .25s ease, box-shadow .25s ease",
              }}
            >
              <div
                style={{
                  fontSize: isActive ? 7 : 6,
                  fontWeight: 900,
                  letterSpacing: "0.5px",
                  color: isActive ? ACCENT_ON : MUTED,
                  textTransform: "uppercase",
                  writingMode: "vertical-lr",
                  textOrientation: "mixed",
                  transform: "rotate(180deg)",
                  lineHeight: 1.1,
                  maxHeight: 60,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {cat.name}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Active category items ──────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: cartCount > 0 ? "calc(74px + env(safe-area-inset-bottom, 0px))" : 20 }}>
        {currentCat && (
          <section
            id={`cat-${currentCat.id}`}
            style={{ scrollMarginTop: 56 }}
            ref={(el) => { if (el) sectionRefs.current.set(currentCat.id, el); else sectionRefs.current.delete(currentCat.id); }}
          >
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "2px", color: ACCENT, padding: "10px 22px 6px", textTransform: "uppercase" }}>
              {currentCat.name} · {currentCat.items.length} items
            </div>
            {currentCat.items.map((item) => (
              <FanItem
                key={item.id}
                item={item}
                isFaved={favIds.has(item.id)}
                onFav={() => toggleFav(item.id)}
                onAdd={() => onItemAdd(item)}
                t={t}
                accent={ACCENT}
                text={TEXT}
                muted={MUTED}
                faint={FAINT}
                cardBg={CARD_BG}
                cardBorder={CARD_BORDER}
              />
            ))}
          </section>
        )}
      </div>

      {/* ── Cart bar ──────────────────────────────────────────────── */}
      {cartCount > 0 && (
        <button type="button" onClick={onOpenCart}
          style={{ position: "absolute", left: 16, right: 16, bottom: "calc(16px + env(safe-area-inset-bottom, 0px))", background: ACCENT, borderRadius: 14, padding: "13px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", border: "none", zIndex: 30 }}
        >
          <span style={{ fontSize: 13, fontWeight: 800, color: ACCENT_ON }}>{cartCount} {cartCount === 1 ? t("item") : t("items")}</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: ACCENT_ON }}>{fmtPrice(cartTotal)} →</span>
        </button>
      )}
    </div>
  );
}

// ── Fan item card ─────────────────────────────────────────────────────────────
function FanItem({ item, isFaved, onFav, onAdd, t, accent, text, muted, faint, cardBg, cardBorder }: {
  item: PublicMenuItem; isFaved: boolean; onFav: () => void; onAdd: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any; accent: string; text: string; muted: string; faint: string; cardBg: string; cardBorder: string;
}) {
  const [justAdded, setJustAdded] = useState(false);
  const soldOut = item.stock_count !== null && item.stock_count === 0;
  const galleryUrl = item.photos?.find((p) => p.url && p.url.trim() !== "")?.url;
  const photoUrl = galleryUrl ?? (item.photo_url?.trim() ? item.photo_url : undefined);

  const handleAdd = () => {
    if (soldOut) return;
    onAdd();
    if (!item.groups.length) { setJustAdded(true); setTimeout(() => setJustAdded(false), 1100); }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "0 16px 8px", padding: "10px 14px", borderRadius: 16, background: cardBg, border: `0.5px solid ${cardBorder}` }}>
      {/* Thumbnail */}
      <div style={{ width: 64, height: 64, borderRadius: 14, overflow: "hidden", flexShrink: 0, position: "relative" }}>
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt={item.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ position: "absolute", inset: 0, background: "#3A2510", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>🫓</div>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: text, lineHeight: 1.2 }}>{item.name}</div>
        {item.description && (
          <div style={{ fontSize: 11, color: muted, lineHeight: 1.4, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.description}</div>
        )}
        <div style={{ fontSize: 14, fontWeight: 800, color: accent, marginTop: 4 }}>
          {soldOut ? t("soldOut") : fmtPrice(item.price_cents)}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <button type="button" onClick={handleAdd} disabled={soldOut}
          style={{ width: 36, height: 36, borderRadius: 99, background: soldOut ? `rgba(245,158,11,.2)` : justAdded ? "#059669" : accent, color: soldOut ? text : ACCENT_ON, border: "none", fontSize: 20, fontWeight: 300, cursor: soldOut ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background .2s ease" }}
        >{justAdded ? "✓" : soldOut ? "—" : "+"}</button>
        <button type="button" onClick={onFav}
          style={{ background: "none", border: "none", fontSize: 14, cursor: "pointer", color: isFaved ? "#FF4D6D" : faint }}
        >{isFaved ? "♥" : "♡"}</button>
      </div>
    </div>
  );
}
