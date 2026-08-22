"use client";

/**
 * #44 Horizontal Filmstrip — board-faithful port ("REEL" cinema-themed bar & kitchen)
 *
 * Each category is a labeled horizontal strip — like a Netflix shelf but with
 * film-aesthetic sprocket holes rendered as dots along the strip edges.
 * Cards are 160×220px portrait frames; the strips stack vertically so the
 * full menu is one long scroll.
 *
 * BG: #0A0A0A (film black) · Accent: #FCD34D (film yellow) · Text: #FFFFFF
 *
 * Critical fixes:
 *  • gallery-first photo URL (fixed 160×220 card — no aspect-ratio CSS)
 *  • env(safe-area-inset-bottom) in cart bar
 *  • section refs + scrollMarginTop: 56
 *  • own cart bar → suppressedTemplates
 *  • own header → showBusinessHeader exclusion
 */

import { useCallback, useState } from "react";
import { IconShoppingBag } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { fmtPrice } from "./shared/format";
import type { MenuTemplateProps } from "./types";
import type { PublicMenuItem } from "../page";

const BG = "#0A0A0A";
const SURFACE = "#141414";
const ACCENT = "#FCD34D"; // film yellow
const ACCENT_ON = "#0A0A0A";
const TEXT = "#FFFFFF";
const MUTED = "rgba(255,255,255,.6)";
const FAINT = "rgba(255,255,255,.25)";
const STRIP_TOP = "#1A1A1A"; // sprocket row bg
const CARD_BG = "#1E1E1E";
const FRAME_BORDER = "rgba(252,211,77,.2)";
const GRAD = "linear-gradient(to top, rgba(10,10,10,.95) 0%, rgba(10,10,10,.4) 55%, rgba(10,10,10,0) 75%)";

// Number of sprocket "holes" to render per strip
const SPROCKET_COUNT = 10;

export default function HorizontalFilmstrip({
  business,
  categories,
  sectionRefs,
  onItemAdd,
  cartCount,
  cartTotal,
  onOpenCart,
}: MenuTemplateProps) {
  const t = useTranslations("menu");
  const [favIds, setFavIds] = useState<Set<string>>(new Set());

  const toggleFav = useCallback((id: string) => {
    setFavIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);

  return (
    <div style={{ position: "relative", minHeight: "var(--menu-vh, 100dvh)", background: BG, display: "flex", flexDirection: "column" }}>

      {/* ── Header ────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, paddingTop: "max(16px, env(safe-area-inset-top, 0px))" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 22px 12px" }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: TEXT, letterSpacing: "2px", textTransform: "uppercase" }}>{business.name}</div>
            <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "3px", color: ACCENT, textTransform: "uppercase", marginTop: 2 }}>{business.category ?? "Menu"} · Now Playing</div>
          </div>
          <button type="button" onClick={onOpenCart} aria-label={t("openCartAria")}
            style={{ position: "relative", width: 38, height: 38, borderRadius: 6, background: SURFACE, border: `0.5px solid rgba(255,255,255,.1)`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <IconShoppingBag size={18} color={ACCENT} />
            {cartCount > 0 && (
              <span style={{ position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 99, background: ACCENT, color: ACCENT_ON, fontSize: 10, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", paddingInline: 4 }}>{cartCount}</span>
            )}
          </button>
        </div>
      </div>

      {/* ── Film strips ───────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: cartCount > 0 ? "calc(74px + env(safe-area-inset-bottom, 0px))" : 20 }}>
        {categories.map((cat) => (
          <section
            key={cat.id}
            id={`cat-${cat.id}`}
            style={{ scrollMarginTop: 56, marginBottom: 24 }}
            ref={(el) => { if (el) sectionRefs.current.set(cat.id, el); else sectionRefs.current.delete(cat.id); }}
          >
            {/* Category label */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 22px 6px" }}>
              <div style={{ width: 3, height: 16, background: ACCENT, borderRadius: 2, flexShrink: 0 }} />
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "2px", color: TEXT, textTransform: "uppercase" }}>{cat.name}</div>
              <div style={{ flex: 1, height: "0.5px", background: FAINT }} />
              <div style={{ fontSize: 9, color: FAINT }}>{cat.items.length} items</div>
            </div>

            {/* Sprocket + card strip */}
            <div style={{ position: "relative", background: SURFACE }}>
              {/* Top sprocket row */}
              <SprocketRow />

              {/* Cards */}
              <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "6px 22px", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
                {cat.items.map((item) => (
                  <FilmCard
                    key={item.id}
                    item={item}
                    isFaved={favIds.has(item.id)}
                    onFav={() => toggleFav(item.id)}
                    onAdd={() => onItemAdd(item)}
                    t={t}
                    accent={ACCENT}
                    accentOn={ACCENT_ON}
                    cardBg={CARD_BG}
                    frameBorder={FRAME_BORDER}
                    grad={GRAD}
                  />
                ))}
              </div>

              {/* Bottom sprocket row */}
              <SprocketRow />
            </div>
          </section>
        ))}
      </div>

      {/* ── Cart bar ──────────────────────────────────────────────── */}
      {cartCount > 0 && (
        <button type="button" onClick={onOpenCart}
          style={{ position: "fixed", left: 16, right: 16, bottom: "calc(16px + env(safe-area-inset-bottom, 0px))", background: ACCENT, borderRadius: 8, padding: "13px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", border: "none", zIndex: 30 }}
        >
          <span style={{ fontSize: 13, fontWeight: 900, color: ACCENT_ON, letterSpacing: "0.5px" }}>{cartCount} {cartCount === 1 ? t("item") : t("items")}</span>
          <span style={{ fontSize: 13, fontWeight: 900, color: ACCENT_ON }}>{fmtPrice(cartTotal)} →</span>
        </button>
      )}
    </div>
  );
}

// ── Sprocket hole row ─────────────────────────────────────────────────────────
function SprocketRow() {
  return (
    <div style={{ display: "flex", alignItems: "center", height: 14, gap: 12, padding: "0 8px", background: "#0A0A0A" }}>
      {Array.from({ length: SPROCKET_COUNT }, (_, i) => (
        <div
          key={i}
          style={{
            width: 10,
            height: 8,
            borderRadius: 2,
            background: "rgba(252,211,77,.18)",
            border: "0.5px solid rgba(252,211,77,.3)",
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  );
}

// ── Film card ─────────────────────────────────────────────────────────────────
function FilmCard({ item, isFaved, onFav, onAdd, t, accent, accentOn, cardBg, frameBorder, grad }: {
  item: PublicMenuItem; isFaved: boolean; onFav: () => void; onAdd: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any; accent: string; accentOn: string; cardBg: string; frameBorder: string; grad: string;
}) {
  const [justAdded, setJustAdded] = useState(false);
  const soldOut = item.stock_count !== null && item.stock_count === 0;
  const galleryUrl = item.photos?.find((p) => p.url && p.url.trim() !== "")?.url;
  const photoUrl = galleryUrl ?? (item.photo_url?.trim() ? item.photo_url : undefined);

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (soldOut) return;
    onAdd();
    if (!item.groups.length) { setJustAdded(true); setTimeout(() => setJustAdded(false), 1100); }
  };

  return (
    <div
      style={{
        flexShrink: 0,
        width: 160,
        height: 224,
        borderRadius: 6,
        overflow: "hidden",
        position: "relative",
        background: cardBg,
        border: `0.5px solid ${frameBorder}`,
        cursor: "pointer",
        opacity: soldOut ? 0.65 : 1,
      }}
      onClick={handleAdd}
    >
      {/* Photo */}
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt={item.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 56 }}>🎬</div>
      )}

      {/* Gradient */}
      <div style={{ position: "absolute", inset: 0, background: grad }} />

      {/* Frame numbers (film aesthetic) */}
      <div style={{ position: "absolute", top: 6, left: 8, fontSize: 8, fontWeight: 900, color: "rgba(252,211,77,.4)", letterSpacing: "1px" }}>
        {String(item.name.charCodeAt(0) % 100).padStart(2, "0")}
      </div>

      {/* Fav */}
      <button type="button" onClick={(e) => { e.stopPropagation(); onFav(); }}
        aria-label={isFaved ? t("removeFavoriteAria") : t("addFavoriteAria")}
        style={{ position: "absolute", top: 4, right: 6, background: "none", border: "none", fontSize: 16, cursor: "pointer", color: isFaved ? "#FF4D6D" : "rgba(255,255,255,.5)" }}
      >{isFaved ? "♥" : "♡"}</button>

      {/* Info */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "0 10px 10px" }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#fff", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", marginBottom: 6 }}>
          {item.name}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, fontWeight: 900, color: accent }}>{soldOut ? t("soldOut") : fmtPrice(item.price_cents)}</span>
          <button type="button" onClick={handleAdd} disabled={soldOut}
            style={{ width: 28, height: 28, borderRadius: 6, background: soldOut ? "rgba(255,255,255,.18)" : justAdded ? "#059669" : accent, color: soldOut ? "#fff" : accentOn, border: "none", fontSize: 17, fontWeight: 300, cursor: soldOut ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background .2s ease" }}
          >{justAdded ? "✓" : soldOut ? "—" : "+"}</button>
        </div>
      </div>
    </div>
  );
}
