"use client";

/**
 * #48 Top-Arc Dial — board-faithful port ("ORBITA" molecular gastronomy)
 *
 * Category selectors are positioned on a concave-up arc across the top of the
 * screen — each chip is placed at a calculated (x, y) position following a
 * circular arc so the middle chip sits highest and the edge chips dip down.
 * Tapping a chip highlights it and shows that category's items in a dark
 * scrollable list below.
 *
 * BG: #0D0D1A (deep space) · Accent: #E879F9 (neon fuchsia) · Text: #FFFFFF
 *
 * Critical fixes:
 *  • gallery-first photo URL (fixed-height photo containers)
 *  • var(--menu-vh, 100dvh) on root
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

const BG = "#0D0D1A";
const SURFACE = "#151525";
const ACCENT = "#E879F9"; // neon fuchsia
const ACCENT_ON = "#0D0D1A";
const TEXT = "#FFFFFF";
const MUTED = "rgba(255,255,255,.6)";
const FAINT = "rgba(255,255,255,.3)";
const CARD_BG = "#1C1C30";
const CARD_BORDER = "rgba(232,121,249,.15)";

// Arc geometry
const ARC_CONTAINER_H = 160; // px — area reserved for the arc
const ARC_RADIUS = 220; // px — the circle that defines the arc curve
const ARC_SPAN_DEG = 70; // total angular span of the arc (left to right)

function arcPosition(i: number, total: number): { x: number; y: number; angleDeg: number } {
  if (total <= 1) return { x: 0, y: 0, angleDeg: 0 };
  // Map index to angle: center = 0°, left edge = -ARC_SPAN_DEG/2, right = +ARC_SPAN_DEG/2
  const angleDeg = -ARC_SPAN_DEG / 2 + (i / (total - 1)) * ARC_SPAN_DEG;
  const rad = (angleDeg * Math.PI) / 180;
  // x from center (px): sin(angle) * radius
  const x = Math.sin(rad) * ARC_RADIUS;
  // y from top (px): radius - cos(angle) * radius  → 0 at center, positive downward at edges
  // But we want center to be HIGHEST (y=0) and edges to DIP DOWN:
  const y = ARC_RADIUS - Math.cos(rad) * ARC_RADIUS;
  return { x, y, angleDeg };
}

export default function TopArcDial({
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

  const handleDial = (catId: string) => {
    setActiveCat(catId);
    scrollToCategory(catId);
  };

  const total = categories.length;

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
      {/* ── Top section: arc dial ──────────────────────────────────── */}
      <div
        style={{
          flexShrink: 0,
          paddingTop: "max(20px, env(safe-area-inset-top, 0px))",
          background: SURFACE,
          borderBottom: `0.5px solid ${CARD_BORDER}`,
        }}
      >
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 22px 8px" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: TEXT, letterSpacing: "2px", textTransform: "uppercase" }}>{business.name}</div>
            <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: "3px", color: ACCENT, textTransform: "uppercase" }}>{business.category ?? "Menu"} · Orbit Selection</div>
          </div>
          <button type="button" onClick={onOpenCart} aria-label={t("openCartAria")}
            style={{ position: "relative", width: 38, height: 38, borderRadius: 12, background: `rgba(232,121,249,.1)`, border: `0.5px solid ${CARD_BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <IconShoppingBag size={18} color={ACCENT} />
            {cartCount > 0 && (
              <span style={{ position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 99, background: ACCENT, color: ACCENT_ON, fontSize: 10, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", paddingInline: 4 }}>{cartCount}</span>
            )}
          </button>
        </div>

        {/* Arc container */}
        <div
          style={{
            position: "relative",
            height: ARC_CONTAINER_H,
            overflow: "visible",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
          }}
        >
          {/* Subtle arc line */}
          <svg
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none" }}
            aria-hidden
          >
            {(() => {
              const cx = "50%";
              const cy = ARC_RADIUS * -0.4; // push circle center up so only the bottom arc shows
              const r = ARC_RADIUS;
              // Draw a simple horizontal arc path
              const startAngle = (90 - ARC_SPAN_DEG / 2) * Math.PI / 180;
              const endAngle = (90 + ARC_SPAN_DEG / 2) * Math.PI / 180;
              // In SVG coords (x grows right, y grows down):
              // center of arc is at (50%, 0 - approx ARC_RADIUS) from the div's top
              // The chip positions are relative, so just draw a guiding ellipse curve
              return (
                <ellipse
                  cx={cx}
                  cy={cy}
                  rx={r * 0.95}
                  ry={r * 0.85}
                  fill="none"
                  stroke={`rgba(232,121,249,.12)`}
                  strokeWidth={0.5}
                />
              );
            })()}
          </svg>

          {/* Chip nodes on the arc */}
          {categories.map((cat, i) => {
            const { x, y } = arcPosition(i, total);
            const isActive = cat.id === activeCat;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleDial(cat.id)}
                style={{
                  position: "absolute",
                  top: y + 8,
                  left: "50%",
                  transform: `translateX(calc(-50% + ${x}px))`,
                  padding: isActive ? "6px 14px" : "5px 12px",
                  borderRadius: 99,
                  background: isActive ? ACCENT : `rgba(232,121,249,.08)`,
                  border: isActive ? "none" : `0.5px solid rgba(232,121,249,.25)`,
                  color: isActive ? ACCENT_ON : MUTED,
                  fontSize: isActive ? 11 : 10,
                  fontWeight: 900,
                  letterSpacing: "0.5px",
                  textTransform: "uppercase" as const,
                  cursor: "pointer",
                  whiteSpace: "nowrap" as const,
                  maxWidth: 100,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  boxShadow: isActive ? `0 0 14px rgba(232,121,249,.45)` : "none",
                  transition: "background .2s, color .2s, box-shadow .2s, padding .2s",
                  zIndex: isActive ? 2 : 1,
                }}
              >
                {cat.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Items list ────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          paddingBottom: cartCount > 0 ? "calc(74px + env(safe-area-inset-bottom, 0px))" : 20,
        }}
      >
        {currentCat && (
          <section
            id={`cat-${currentCat.id}`}
            style={{ scrollMarginTop: 56 }}
            ref={(el) => { if (el) sectionRefs.current.set(currentCat.id, el); else sectionRefs.current.delete(currentCat.id); }}
          >
            <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "2.5px", color: ACCENT, padding: "10px 22px 6px", textTransform: "uppercase" }}>
              {currentCat.name} · {currentCat.items.length} items
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "0 16px" }}>
              {currentCat.items.map((item, itemIdx) => (
                <DialCard
                  key={item.id}
                  item={item}
                  itemIdx={itemIdx}
                  isFaved={favIds.has(item.id)}
                  onFav={() => toggleFav(item.id)}
                  onAdd={() => onItemAdd(item)}
                  t={t}
                  accent={ACCENT}
                  accentOn={ACCENT_ON}
                  text={TEXT}
                  muted={MUTED}
                  faint={FAINT}
                  cardBg={CARD_BG}
                  cardBorder={CARD_BORDER}
                />
              ))}
            </div>
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

// ── Dial card ─────────────────────────────────────────────────────────────────
function DialCard({ item, itemIdx, isFaved, onFav, onAdd, t, accent, accentOn, text, muted, faint, cardBg, cardBorder }: {
  item: PublicMenuItem; itemIdx: number; isFaved: boolean; onFav: () => void; onAdd: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any; accent: string; accentOn: string; text: string; muted: string; faint: string; cardBg: string; cardBorder: string;
}) {
  const [justAdded, setJustAdded] = useState(false);
  const soldOut = item.stock_count !== null && item.stock_count === 0;
  const galleryUrl = item.photos?.find((p) => p.url && p.url.trim() !== "")?.url;
  const photoUrl = galleryUrl ?? (item.photo_url?.trim() ? item.photo_url : undefined);
  // First item in grid is taller (featured)
  const isFeatured = itemIdx === 0;
  const photoH = isFeatured ? 180 : 120;

  const handleAdd = () => {
    if (soldOut) return;
    onAdd();
    if (!item.groups.length) { setJustAdded(true); setTimeout(() => setJustAdded(false), 1100); }
  };

  return (
    <div
      style={{
        borderRadius: 16,
        overflow: "hidden",
        background: cardBg,
        border: `0.5px solid ${cardBorder}`,
        gridColumn: isFeatured ? "1 / -1" : "auto",
        display: "flex",
        flexDirection: isFeatured ? "row" : "column",
        opacity: soldOut ? 0.65 : 1,
        marginBottom: 2,
      }}
    >
      {/* Photo */}
      <div
        style={{
          position: "relative",
          height: photoH,
          width: isFeatured ? "45%" : "100%",
          flexShrink: 0,
          background: "#1A1A2E",
          overflow: "hidden",
        }}
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt={item.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: isFeatured ? 48 : 32 }}>🧪</div>
        )}

        {/* Fuchsia glow on featured */}
        {isFeatured && (
          <div style={{ position: "absolute", bottom: -20, left: -20, width: 80, height: 80, borderRadius: 99, background: `rgba(232,121,249,.15)`, filter: "blur(20px)" }} />
        )}

        {/* Fav */}
        <button type="button" onClick={(e) => { e.stopPropagation(); onFav(); }}
          aria-label={isFaved ? t("removeFavoriteAria") : t("addFavoriteAria")}
          style={{ position: "absolute", top: 6, right: 6, background: "rgba(13,13,26,.7)", border: "none", width: 24, height: 24, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, cursor: "pointer", color: isFaved ? "#FF4D6D" : faint }}
        >{isFaved ? "♥" : "♡"}</button>
      </div>

      {/* Info */}
      <div style={{ padding: isFeatured ? "16px 14px" : "10px 12px 12px", flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: isFeatured ? 15 : 12, fontWeight: 800, color: text, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{item.name}</div>
          {item.description && isFeatured && (
            <div style={{ fontSize: 11, color: muted, lineHeight: 1.4, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{item.description}</div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 900, color: accent }}>{soldOut ? t("soldOut") : fmtPrice(item.price_cents)}</span>
          <button type="button" onClick={handleAdd} disabled={soldOut}
            style={{ width: 30, height: 30, borderRadius: 10, background: soldOut ? "rgba(232,121,249,.15)" : justAdded ? "#059669" : accent, color: soldOut ? "#fff" : accentOn, border: "none", fontSize: 18, fontWeight: 300, cursor: soldOut ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background .2s ease" }}
          >{justAdded ? "✓" : soldOut ? "—" : "+"}</button>
        </div>
      </div>
    </div>
  );
}
