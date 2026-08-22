"use client";

/**
 * #50 Bento Deluxe — board-faithful port ("MOSAIC" premium seasonal kitchen)
 *
 * An evolved bento grid with varied cell sizes per category:
 *   Row A: 1 full-width hero card (photo 220px, info below)
 *   Row B: 2-col pair (photo 130px)
 *   Row C: 3-col trio (photo 90px)
 *   Then repeats A → B → C …
 *
 * Extremely clean, minimal — near-black on warm white, thin borders, lots of
 * breathing room. Editorial type hierarchy (Playfair Display for names).
 *
 * BG: #FAFAFA · Accent: #0F172A (near-black navy) · Text: #0F172A
 *
 * Critical fixes:
 *  • gallery-first photo URL (all photos fixed-height px containers)
 *  • env(safe-area-inset-bottom) in cart bar
 *  • section refs + scrollMarginTop: 56
 *  • own cart bar → suppressedTemplates
 *  • own header → showBusinessHeader exclusion
 */

import React, { useCallback, useState } from "react";
import { IconShoppingBag } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { fmtPrice } from "./shared/format";
import type { MenuTemplateProps } from "./types";
import type { PublicMenuItem } from "../page";

const BG = "#FAFAFA";
const SURFACE = "#FFFFFF";
const ACCENT = "#0F172A"; // near-black navy
const ACCENT_ON = "#FFFFFF";
const TEXT = "#0F172A";
const MUTED = "#6B7280";
const FAINT = "#9CA3AF";
const BORDER = "#E5E7EB";
const ACCENT_LIGHT = "rgba(15,23,42,.06)";
const PRICE_COLOR = "#0F172A";

export default function BentoDeluxe({
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
    setFavIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);

  return (
    <div style={{ position: "relative", minHeight: "var(--menu-vh, 100dvh)", background: BG, display: "flex", flexDirection: "column" }}>

      {/* ── Header ────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, paddingTop: "max(20px, env(safe-area-inset-top, 0px))", borderBottom: `0.5px solid ${BORDER}`, background: SURFACE }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px 10px" }}>
          <div>
            <div
              style={{
                fontFamily: "var(--font-playfair), 'Playfair Display', Georgia, serif",
                fontSize: 24,
                color: TEXT,
                lineHeight: 1.0,
              }}
            >
              {business.name}
            </div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "2.5px", color: MUTED, textTransform: "uppercase", marginTop: 4 }}>
              {business.category ?? "Seasonal Menu"}
            </div>
          </div>
          <button type="button" onClick={onOpenCart} aria-label={t("openCartAria")}
            style={{ position: "relative", width: 40, height: 40, borderRadius: 12, background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "none" }}
          >
            <IconShoppingBag size={18} color={ACCENT_ON} />
            {cartCount > 0 && (
              <span style={{ position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 99, background: "#EF4444", color: "#fff", fontSize: 10, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", paddingInline: 4 }}>{cartCount}</span>
            )}
          </button>
        </div>

        {/* Category tabs */}
        <div style={{ display: "flex", gap: 0, overflowX: "auto", scrollbarWidth: "none" }}>
          {categories.map((cat) => {
            const isActive = activeCategory === cat.id;
            return (
              <button key={cat.id} type="button" onClick={() => scrollToCategory(cat.id)}
                style={{ flexShrink: 0, fontSize: 11, fontWeight: isActive ? 800 : 600, padding: "8px 18px", border: "none", borderBottom: isActive ? `2px solid ${ACCENT}` : "2px solid transparent", cursor: "pointer", background: "none", color: isActive ? TEXT : MUTED, transition: "color .18s, border-color .18s", whiteSpace: "nowrap" }}
              >{cat.name}</button>
            );
          })}
        </div>
      </div>

      {/* ── Bento grid ────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: cartCount > 0 ? "calc(74px + env(safe-area-inset-bottom, 0px))" : 24 }}>
        {categories.map((cat) => (
          <section
            key={cat.id}
            id={`cat-${cat.id}`}
            style={{ scrollMarginTop: 56 }}
            ref={(el) => { if (el) sectionRefs.current.set(cat.id, el); else sectionRefs.current.delete(cat.id); }}
          >
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "2px", color: FAINT, padding: "16px 24px 8px", textTransform: "uppercase" }}>
              {cat.name}
            </div>
            <BentoLayout
              items={cat.items}
              favIds={favIds}
              toggleFav={toggleFav}
              onItemAdd={onItemAdd}
              t={t}
            />
          </section>
        ))}
      </div>

      {/* ── Cart bar ──────────────────────────────────────────────── */}
      {cartCount > 0 && (
        <button type="button" onClick={onOpenCart}
          style={{ position: "fixed", left: 16, right: 16, bottom: "calc(16px + env(safe-area-inset-bottom, 0px))", background: ACCENT, borderRadius: 14, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", border: "none", zIndex: 30 }}
        >
          <span style={{ fontSize: 13, fontWeight: 800, color: ACCENT_ON }}>{cartCount} {cartCount === 1 ? t("item") : t("items")}</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: ACCENT_ON }}>{fmtPrice(cartTotal)} →</span>
        </button>
      )}
    </div>
  );
}

// ── Bento layout: Hero → Pair → Trio → repeat ─────────────────────────────────
function BentoLayout({ items, favIds, toggleFav, onItemAdd, t }: {
  items: PublicMenuItem[];
  favIds: Set<string>;
  toggleFav: (id: string) => void;
  onItemAdd: (item: PublicMenuItem) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}) {
  const rows: React.ReactElement[] = [];
  let i = 0;
  let rowNum = 0;

  while (i < items.length) {
    const pattern = rowNum % 3; // 0=hero, 1=pair, 2=trio
    if (pattern === 0) {
      // Hero: 1 item, full-width
      if (items[i]) {
        rows.push(
          <div key={`hero-${i}`} style={{ padding: "0 16px 12px" }}>
            <BentoHero
              item={items[i]}
              isFaved={favIds.has(items[i].id)}
              onFav={() => toggleFav(items[i].id)}
              onAdd={() => onItemAdd(items[i])}
              t={t}
            />
          </div>
        );
        i += 1;
      }
    } else if (pattern === 1) {
      // Pair: 2 items side by side
      const pair = items.slice(i, i + 2);
      rows.push(
        <div key={`pair-${i}`} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "0 16px 12px" }}>
          {pair.map((item) => (
            <BentoPairCard
              key={item.id}
              item={item}
              isFaved={favIds.has(item.id)}
              onFav={() => toggleFav(item.id)}
              onAdd={() => onItemAdd(item)}
              t={t}
            />
          ))}
        </div>
      );
      i += pair.length;
    } else {
      // Trio: 3 items
      const trio = items.slice(i, i + 3);
      rows.push(
        <div key={`trio-${i}`} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, padding: "0 16px 12px" }}>
          {trio.map((item) => (
            <BentoTrioCard
              key={item.id}
              item={item}
              isFaved={favIds.has(item.id)}
              onFav={() => toggleFav(item.id)}
              onAdd={() => onItemAdd(item)}
              t={t}
            />
          ))}
        </div>
      );
      i += trio.length;
    }
    rowNum++;
  }

  return <>{rows}</>;
}

// ── Hero card ─────────────────────────────────────────────────────────────────
function BentoHero({ item, isFaved, onFav, onAdd, t }: {
  item: PublicMenuItem; isFaved: boolean; onFav: () => void; onAdd: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
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
    <div style={{ borderRadius: 18, overflow: "hidden", background: SURFACE, border: `0.5px solid ${BORDER}`, boxShadow: "0 2px 12px rgba(15,23,42,.06)" }}>
      {/* Photo */}
      <div style={{ position: "relative", height: 220 }}>
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt={item.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ position: "absolute", inset: 0, background: ACCENT_LIGHT, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 60 }}>🍽️</div>
        )}
        {/* Fav */}
        <button type="button" onClick={(e) => { e.stopPropagation(); onFav(); }}
          aria-label={isFaved ? t("removeFavoriteAria") : t("addFavoriteAria")}
          style={{ position: "absolute", top: 12, right: 12, background: "rgba(255,255,255,.92)", border: "none", width: 30, height: 30, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, cursor: "pointer", color: isFaved ? "#FF4D6D" : MUTED }}
        >{isFaved ? "♥" : "♡"}</button>
      </div>
      {/* Info */}
      <div style={{ padding: "14px 16px 16px", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-playfair), 'Playfair Display', Georgia, serif", fontSize: 18, color: TEXT, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{item.name}</div>
          {item.description && (
            <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.4, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{item.description}</div>
          )}
          <div style={{ fontSize: 15, fontWeight: 900, color: PRICE_COLOR, marginTop: 8 }}>{soldOut ? t("soldOut") : fmtPrice(item.price_cents)}</div>
        </div>
        <button type="button" onClick={handleAdd} disabled={soldOut}
          style={{ flexShrink: 0, width: 42, height: 42, borderRadius: 12, background: soldOut ? ACCENT_LIGHT : justAdded ? "#059669" : ACCENT, color: soldOut ? MUTED : ACCENT_ON, border: "none", fontSize: 24, fontWeight: 300, cursor: soldOut ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background .2s ease" }}
        >{justAdded ? "✓" : soldOut ? "—" : "+"}</button>
      </div>
    </div>
  );
}

// ── Pair card ─────────────────────────────────────────────────────────────────
function BentoPairCard({ item, isFaved, onFav, onAdd, t }: {
  item: PublicMenuItem; isFaved: boolean; onFav: () => void; onAdd: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
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
    <div style={{ borderRadius: 14, overflow: "hidden", background: SURFACE, border: `0.5px solid ${BORDER}`, boxShadow: "0 1px 6px rgba(15,23,42,.05)" }}>
      <div style={{ position: "relative", height: 130 }}>
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt={item.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ position: "absolute", inset: 0, background: ACCENT_LIGHT, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36 }}>🍴</div>
        )}
        <button type="button" onClick={(e) => { e.stopPropagation(); onFav(); }}
          aria-label={isFaved ? t("removeFavoriteAria") : t("addFavoriteAria")}
          style={{ position: "absolute", top: 6, right: 6, background: "rgba(255,255,255,.88)", border: "none", width: 24, height: 24, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, cursor: "pointer", color: isFaved ? "#FF4D6D" : MUTED }}
        >{isFaved ? "♥" : "♡"}</button>
      </div>
      <div style={{ padding: "10px 12px 12px" }}>
        <div style={{ fontFamily: "var(--font-playfair), 'Playfair Display', Georgia, serif", fontSize: 13, color: TEXT, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", marginBottom: 6 }}>{item.name}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, fontWeight: 900, color: PRICE_COLOR }}>{soldOut ? "—" : fmtPrice(item.price_cents)}</span>
          <button type="button" onClick={handleAdd} disabled={soldOut}
            style={{ width: 28, height: 28, borderRadius: 8, background: soldOut ? ACCENT_LIGHT : justAdded ? "#059669" : ACCENT, color: soldOut ? MUTED : ACCENT_ON, border: "none", fontSize: 17, fontWeight: 300, cursor: soldOut ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background .2s ease" }}
          >{justAdded ? "✓" : soldOut ? "—" : "+"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Trio card ─────────────────────────────────────────────────────────────────
function BentoTrioCard({ item, isFaved, onFav, onAdd, t }: {
  item: PublicMenuItem; isFaved: boolean; onFav: () => void; onAdd: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
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
    <div style={{ borderRadius: 12, overflow: "hidden", background: SURFACE, border: `0.5px solid ${BORDER}` }}>
      <div style={{ position: "relative", height: 90 }}>
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt={item.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ position: "absolute", inset: 0, background: ACCENT_LIGHT, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>🍽</div>
        )}
      </div>
      <div style={{ padding: "7px 8px 8px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: TEXT, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", marginBottom: 4 }}>{item.name}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 10, fontWeight: 900, color: PRICE_COLOR }}>{soldOut ? "—" : fmtPrice(item.price_cents)}</span>
          <button type="button" onClick={handleAdd} disabled={soldOut}
            style={{ width: 22, height: 22, borderRadius: 6, background: soldOut ? ACCENT_LIGHT : justAdded ? "#059669" : ACCENT, color: soldOut ? MUTED : ACCENT_ON, border: "none", fontSize: 14, fontWeight: 300, cursor: soldOut ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background .2s ease" }}
          >{justAdded ? "✓" : soldOut ? "—" : "+"}</button>
        </div>
      </div>
    </div>
  );
}
