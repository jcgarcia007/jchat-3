"use client";

/**
 * #46 Sticky Hero + Sheet — board-faithful port ("ANCHOR" coastal American)
 *
 * A full-bleed hero photo (top 48%) sits fixed in the background. An
 * iOS-style rounded bottom sheet (top 42% → 100%) slides over it and
 * contains the category pills + scrollable item list. The hero never
 * scrolls — only the sheet content does.
 *
 * BG: #1A2332 (deep navy) · Accent: #FF7A5C (coral) · Text: #FFFFFF
 *
 * Critical fixes:
 *  • gallery-first photo URL (hero uses position:absolute img, NOT aspect-ratio)
 *  • var(--menu-vh, 100dvh) on root container
 *  • env(safe-area-inset-bottom) in cart bar
 *  • own cart bar → suppressedTemplates
 *  • own header → showBusinessHeader exclusion
 *  • section refs + scrollMarginTop: 56
 */

import { useCallback, useRef, useState } from "react";
import { IconShoppingBag, IconMapPin } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { fmtPrice } from "./shared/format";
import type { MenuTemplateProps } from "./types";
import type { PublicMenuItem } from "../page";

const NAVY = "#1A2332";
const SHEET_BG = "#FFFFFF";
const SHEET_ELEVATED = "#F8F9FB";
const ACCENT = "#FF7A5C"; // coral
const ACCENT_ON = "#FFFFFF";
const TEXT = "#1A2332";
const MUTED = "#6B7FA3";
const BORDER = "#E8EDF5";
const CHIP_BG = "rgba(255,122,92,.08)";
const CHIP_TEXT = "#FF7A5C";
const CHIP_ACTIVE_BG = "#FF7A5C";
const CHIP_ACTIVE_TEXT = "#fff";

export default function StickyHeroSheet({
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
  const scrollRef = useRef<HTMLDivElement>(null);

  const toggleFav = useCallback((id: string) => {
    setFavIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);

  // Hero image — use first category's first item photo as default
  const heroItem = categories[0]?.items[0];
  const heroGallery = heroItem?.photos?.find((p) => p.url && p.url.trim() !== "")?.url;
  const heroUrl = heroGallery ?? heroItem?.photo_url?.trim() ?? undefined;

  return (
    <div
      style={{
        position: "relative",
        height: "var(--menu-vh, 100dvh)",
        overflow: "hidden",
        background: NAVY,
      }}
    >
      {/* ── Hero (fixed behind the sheet) ─────────────────────────── */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "52%",
        }}
      >
        {heroUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroUrl}
            alt={business.name}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, #1A2332 0%, #2A3D5C 100%)` }} />
        )}

        {/* Gradient fade to sheet */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(26,35,50,.25) 0%, rgba(26,35,50,0) 40%, rgba(255,255,255,.5) 85%, #fff 100%)" }} />

        {/* Top overlay: business info */}
        <div style={{ position: "absolute", top: "max(16px, env(safe-area-inset-top, 0px))", left: 0, right: 0, padding: "0 22px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", lineHeight: 1.1, textShadow: "0 2px 8px rgba(0,0,0,.4)" }}>{business.name}</div>
            {business.category && (
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                <IconMapPin size={11} color="rgba(255,255,255,.8)" />
                <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.8)", letterSpacing: "1px", textTransform: "uppercase" }}>{business.category}</span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onOpenCart}
            aria-label={t("openCartAria")}
            style={{ position: "relative", width: 38, height: 38, borderRadius: 99, background: "rgba(255,255,255,.25)", backdropFilter: "blur(8px)", border: "0.5px solid rgba(255,255,255,.4)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
          >
            <IconShoppingBag size={18} color="#fff" />
            {cartCount > 0 && (
              <span style={{ position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 99, background: ACCENT, color: ACCENT_ON, fontSize: 10, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", paddingInline: 4 }}>{cartCount}</span>
            )}
          </button>
        </div>
      </div>

      {/* ── Bottom sheet ──────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          top: "44%",
          left: 0,
          right: 0,
          bottom: 0,
          background: SHEET_BG,
          borderRadius: "28px 28px 0 0",
          boxShadow: "0 -8px 32px rgba(26,35,50,.18)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Drag handle */}
        <div style={{ flexShrink: 0, display: "flex", justifyContent: "center", paddingTop: 10, paddingBottom: 4 }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: "rgba(26,35,50,.15)" }} />
        </div>

        {/* Category chips */}
        <div style={{ flexShrink: 0, display: "flex", gap: 8, overflowX: "auto", padding: "4px 22px 10px", scrollbarWidth: "none" }}>
          {categories.map((cat) => {
            const isActive = activeCategory === cat.id;
            return (
              <button key={cat.id} type="button" onClick={() => scrollToCategory(cat.id)}
                style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, padding: "6px 16px", borderRadius: 99, border: "none", cursor: "pointer", background: isActive ? CHIP_ACTIVE_BG : CHIP_BG, color: isActive ? CHIP_ACTIVE_TEXT : CHIP_TEXT, transition: "background .18s, color .18s" }}
              >{cat.name}</button>
            );
          })}
        </div>

        <div style={{ height: "0.5px", background: BORDER, flexShrink: 0 }} />

        {/* Scrollable items */}
        <div
          ref={scrollRef}
          style={{ flex: 1, overflowY: "auto", paddingBottom: cartCount > 0 ? "calc(74px + env(safe-area-inset-bottom, 0px))" : 20 }}
        >
          {categories.map((cat) => (
            <section
              key={cat.id}
              id={`cat-${cat.id}`}
              style={{ scrollMarginTop: 56 }}
              ref={(el) => { if (el) sectionRefs.current.set(cat.id, el); else sectionRefs.current.delete(cat.id); }}
            >
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "1.5px", color: MUTED, padding: "10px 22px 6px", textTransform: "uppercase" }}>
                {cat.name}
              </div>
              {cat.items.map((item) => (
                <SheetItem
                  key={item.id}
                  item={item}
                  isFaved={favIds.has(item.id)}
                  onFav={() => toggleFav(item.id)}
                  onAdd={() => onItemAdd(item)}
                  t={t}
                  accent={ACCENT}
                  text={TEXT}
                  muted={MUTED}
                  border={BORDER}
                  sheetElevated={SHEET_ELEVATED}
                />
              ))}
            </section>
          ))}
        </div>

        {/* Cart bar — absolute within sheet */}
        {cartCount > 0 && (
          <button type="button" onClick={onOpenCart}
            style={{ position: "absolute", left: 16, right: 16, bottom: "calc(12px + env(safe-area-inset-bottom, 0px))", background: ACCENT, borderRadius: 16, padding: "13px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", border: "none", zIndex: 20 }}
          >
            <span style={{ fontSize: 13, fontWeight: 800, color: ACCENT_ON }}>{cartCount} {cartCount === 1 ? t("item") : t("items")}</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: ACCENT_ON }}>{fmtPrice(cartTotal)} →</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Sheet item row ────────────────────────────────────────────────────────────
function SheetItem({ item, isFaved, onFav, onAdd, t, accent, text, muted, border, sheetElevated }: {
  item: PublicMenuItem; isFaved: boolean; onFav: () => void; onAdd: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any; accent: string; text: string; muted: string; border: string; sheetElevated: string;
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
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 22px", borderBottom: `0.5px solid ${border}` }}>
      {/* Photo */}
      <div style={{ width: 70, height: 70, borderRadius: 14, overflow: "hidden", flexShrink: 0, position: "relative", background: sheetElevated }}>
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt={item.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>🦞</div>
        )}
        {/* Fav */}
        <button type="button" onClick={(e) => { e.stopPropagation(); onFav(); }}
          aria-label={isFaved ? t("removeFavoriteAria") : t("addFavoriteAria")}
          style={{ position: "absolute", top: 4, right: 4, background: "rgba(255,255,255,.88)", border: "none", width: 22, height: 22, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, cursor: "pointer", color: isFaved ? "#FF4D6D" : muted }}
        >{isFaved ? "♥" : "♡"}</button>
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: text, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
        {item.description && (
          <div style={{ fontSize: 11, color: muted, lineHeight: 1.4, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.description}</div>
        )}
        <div style={{ fontSize: 13, fontWeight: 800, color: accent, marginTop: 4 }}>
          {soldOut ? t("soldOut") : fmtPrice(item.price_cents)}
        </div>
      </div>

      {/* Add */}
      <button type="button" onClick={handleAdd} disabled={soldOut}
        style={{ width: 34, height: 34, borderRadius: 99, background: soldOut ? "rgba(255,122,92,.15)" : justAdded ? "#059669" : accent, color: "#fff", border: "none", fontSize: 20, fontWeight: 300, cursor: soldOut ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background .2s ease" }}
      >{justAdded ? "✓" : soldOut ? "—" : "+"}</button>
    </div>
  );
}
