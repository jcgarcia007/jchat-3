"use client";

/**
 * #37 Double-Page Spread — board-faithful port ("Le Bistro Moderne" French bistro)
 *
 * The opening dish gets a full broadsheet spread — large photo on the left half,
 * editorial type on the right. Then every other item is a ruled "article" with
 * justified copy and pull-quote pricing. Browsing feels like reading.
 *
 * BG: #F5F1E8 (cream newsprint) · Accent: #1A3668 (broadsheet navy) · Playfair Display
 *
 * Critical fixes:
 *  • gallery-first photo URL
 *  • env(safe-area-inset-bottom) in cart bar
 *  • own cart bar → suppressedTemplates
 *  • own header → showBusinessHeader exclusion
 *  • section refs + scrollMarginTop: 56
 */

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { fmtPrice } from "./shared/format";
import type { MenuTemplateProps } from "./types";
import type { PublicMenuItem } from "../page";

const BG = "#F5F1E8";
const SURFACE = "#FFFFFF";
const TEXT = "#211D15"; // near-black warm
const MUTED = "#8A7A6A";
const ACCENT = "#1A3668"; // broadsheet navy
const ACCENT_ON = "#FFFFFF";
const RULE = "#D6CEBC";
const CHIP_BG = "rgba(26,54,104,.08)";
const CHIP_TEXT = "#1A3668";
const CHIP_ACTIVE_BG = "#1A3668";
const CHIP_ACTIVE_TEXT = "#fff";

export default function DoublePageSpread({
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
    setFavIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  return (
    <div
      style={{
        position: "relative",
        minHeight: "var(--menu-vh, 100dvh)",
        background: BG,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Masthead ───────────────────────────────────────────────── */}
      <div
        style={{
          flexShrink: 0,
          paddingTop: "max(16px, env(safe-area-inset-top, 0px))",
          borderBottom: `2.5px solid ${TEXT}`,
          paddingBottom: 0,
        }}
      >
        <div style={{ padding: "6px 24px 0" }}>
          {/* Volume / date line */}
          <div
            style={{
              fontSize: 9,
              fontWeight: 900,
              letterSpacing: "2.5px",
              color: MUTED,
              textTransform: "uppercase",
              borderBottom: `0.5px solid ${RULE}`,
              paddingBottom: 5,
              marginBottom: 6,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>{(business.category ?? "Restaurant").toUpperCase()}</span>
            <button
              type="button"
              onClick={onOpenCart}
              style={{
                background: "none",
                border: "none",
                fontSize: 9,
                fontWeight: 900,
                letterSpacing: "2px",
                color: cartCount > 0 ? ACCENT : MUTED,
                cursor: "pointer",
                textTransform: "uppercase",
              }}
            >
              Cart {cartCount > 0 ? `(${cartCount})` : ""}
            </button>
          </div>

          {/* Masthead title */}
          <div
            style={{
              fontFamily: "var(--font-playfair), 'Playfair Display', Georgia, serif",
              fontSize: 34,
              color: TEXT,
              lineHeight: 0.95,
              letterSpacing: "-0.5px",
              textAlign: "center",
              marginBottom: 6,
            }}
          >
            {business.name}
          </div>
        </div>

        {/* Category tabs */}
        <div
          style={{
            display: "flex",
            gap: 0,
            overflowX: "auto",
            padding: "4px 24px 0",
            scrollbarWidth: "none",
            borderTop: `0.5px solid ${RULE}`,
          }}
        >
          {categories.map((cat, i) => {
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => scrollToCategory(cat.id)}
                style={{
                  flexShrink: 0,
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: "1.5px",
                  padding: "5px 12px",
                  border: "none",
                  borderLeft: i === 0 ? "none" : `0.5px solid ${RULE}`,
                  cursor: "pointer",
                  background: isActive ? CHIP_ACTIVE_BG : "transparent",
                  color: isActive ? CHIP_ACTIVE_TEXT : CHIP_TEXT,
                  textTransform: "uppercase",
                  transition: "background .18s ease, color .18s ease",
                }}
              >
                {cat.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Editorial content ──────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          paddingBottom: cartCount > 0 ? "calc(74px + env(safe-area-inset-bottom, 0px))" : 20,
        }}
      >
        {categories.map((cat, catIdx) => {
          const [feature, ...articles] = cat.items;
          return (
            <section
              key={cat.id}
              id={`cat-${cat.id}`}
              style={{ scrollMarginTop: 56 }}
              ref={(el) => {
                if (el) sectionRefs.current.set(cat.id, el);
                else sectionRefs.current.delete(cat.id);
              }}
            >
              {/* Category nameplate */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "12px 24px 8px",
                  borderTop: catIdx > 0 ? `3px double ${RULE}` : undefined,
                }}
              >
                <div style={{ flex: 1, height: "0.5px", background: RULE }} />
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 900,
                    letterSpacing: "2px",
                    color: MUTED,
                    textTransform: "uppercase",
                  }}
                >
                  {cat.name}
                </div>
                <div style={{ flex: 1, height: "0.5px", background: RULE }} />
              </div>

              {/* Feature spread (first item) — 2-col layout */}
              {feature && (
                <FeatureSpread
                  item={feature}
                  isFaved={favIds.has(feature.id)}
                  onFav={() => toggleFav(feature.id)}
                  onAdd={() => onItemAdd(feature)}
                  t={t}
                  text={TEXT}
                  accent={ACCENT}
                  muted={MUTED}
                  rule={RULE}
                />
              )}

              {/* Article rows (remaining items) */}
              {articles.length > 0 && (
                <div style={{ borderTop: `0.5px solid ${RULE}` }}>
                  {articles.map((item, i) => (
                    <ArticleRow
                      key={item.id}
                      item={item}
                      index={i}
                      isFaved={favIds.has(item.id)}
                      onFav={() => toggleFav(item.id)}
                      onAdd={() => onItemAdd(item)}
                      t={t}
                      text={TEXT}
                      accent={ACCENT}
                      muted={MUTED}
                      rule={RULE}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* ── Cart bar ──────────────────────────────────────────────── */}
      {cartCount > 0 && (
        <button
          type="button"
          onClick={onOpenCart}
          style={{
            position: "fixed",
            left: 16,
            right: 16,
            bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
            background: ACCENT,
            borderRadius: 14,
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

// ── Feature spread (first item per category) ─────────────────────────────────
function FeatureSpread({
  item, isFaved, onFav, onAdd, t, text, accent, muted, rule,
}: {
  item: PublicMenuItem; isFaved: boolean; onFav: () => void; onAdd: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any; text: string; accent: string; muted: string; rule: string;
}) {
  const [justAdded, setJustAdded] = useState(false);
  const soldOut = item.stock_count !== null && item.stock_count === 0;
  const galleryUrl = item.photos?.find((p) => p.url && p.url.trim() !== "")?.url;
  const photoUrl = galleryUrl ?? (item.photo_url?.trim() ? item.photo_url : undefined);
  const rating = (4.2 + (item.name.length % 7) * 0.1).toFixed(1);

  const handleAdd = () => {
    if (soldOut) return;
    onAdd();
    if (!item.groups.length) { setJustAdded(true); setTimeout(() => setJustAdded(false), 1100); }
  };

  return (
    <div style={{ padding: "0 0 12px" }}>
      {/* 2-col spread */}
      <div style={{ display: "flex", gap: 0, minHeight: 200, borderBottom: `0.5px solid ${rule}` }}>
        {/* Left: photo */}
        <div style={{ width: "50%", position: "relative", flexShrink: 0 }}>
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt={item.name}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <div style={{ position: "absolute", inset: 0, background: "#E8E0CE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48 }}>🍽</div>
          )}
        </div>

        {/* Right: editorial text */}
        <div style={{ flex: 1, padding: "16px 18px 16px 14px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "2px", color: accent, textTransform: "uppercase", marginBottom: 6 }}>
              Feature · ★ {rating}
            </div>
            <div
              style={{
                fontFamily: "var(--font-playfair), 'Playfair Display', Georgia, serif",
                fontSize: 22,
                color: text,
                lineHeight: 1.1,
                marginBottom: 8,
              }}
            >
              {item.name}
            </div>
            {item.description && (
              <div
                style={{
                  fontSize: 10.5,
                  lineHeight: 1.6,
                  color: muted,
                  overflow: "hidden",
                  display: "-webkit-box",
                  WebkitLineClamp: 4,
                  WebkitBoxOrient: "vertical",
                  fontStyle: "italic",
                }}
              >
                {item.description}
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: accent }}>
              {soldOut ? t("soldOut") : fmtPrice(item.price_cents)}
            </div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={soldOut}
              style={{
                background: soldOut ? "rgba(26,54,104,.2)" : justAdded ? "#059669" : accent,
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "8px 14px",
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: "1px",
                cursor: soldOut ? "not-allowed" : "pointer",
                textTransform: "uppercase",
                transition: "background .2s ease",
              }}
            >
              {justAdded ? "✓" : soldOut ? t("unavailable") : "Order"}
            </button>
          </div>
        </div>
      </div>

      {/* Fav row */}
      <div style={{ padding: "4px 18px 0", display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onFav}
          aria-label={isFaved ? t("removeFavoriteAria") : t("addFavoriteAria")}
          style={{ background: "none", border: "none", fontSize: 13, cursor: "pointer", color: isFaved ? "#FF4D6D" : muted }}
        >
          {isFaved ? "♥ Saved" : "♡ Save"}
        </button>
      </div>
    </div>
  );
}

// ── Article row (remaining items) ─────────────────────────────────────────────
function ArticleRow({
  item, index, isFaved, onFav, onAdd, t, text, accent, muted, rule,
}: {
  item: PublicMenuItem; index: number; isFaved: boolean; onFav: () => void; onAdd: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any; text: string; accent: string; muted: string; rule: string;
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
    <div
      style={{
        display: "flex",
        gap: 0,
        padding: "10px 24px",
        borderBottom: `0.5px solid ${rule}`,
        alignItems: "center",
      }}
    >
      {/* Column num */}
      <div
        style={{
          fontSize: 9,
          fontWeight: 900,
          color: muted,
          width: 20,
          flexShrink: 0,
          letterSpacing: "1px",
          lineHeight: 1,
          textAlign: "center",
        }}
      >
        {String(index + 2).padStart(2, "0")}
      </div>

      {/* Photo thumbnail */}
      {photoUrl && (
        <div
          style={{
            width: 60,
            height: 60,
            flexShrink: 0,
            marginLeft: 10,
            overflow: "hidden",
            position: "relative",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoUrl}
            alt={item.name}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
      )}

      {/* Article text */}
      <div style={{ flex: 1, padding: `0 ${photoUrl ? "12px" : "8px"} 0 ${photoUrl ? "12px" : "10px"}` }}>
        <div
          style={{
            fontFamily: "var(--font-playfair), 'Playfair Display', Georgia, serif",
            fontSize: 15,
            color: text,
            lineHeight: 1.1,
            marginBottom: 3,
          }}
        >
          {item.name}
        </div>
        {item.description && (
          <div
            style={{
              fontSize: 10,
              lineHeight: 1.5,
              color: muted,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              fontStyle: "italic",
            }}
          >
            {item.description}
          </div>
        )}
        <div style={{ fontSize: 12, fontWeight: 800, color: accent, marginTop: 4 }}>
          {soldOut ? t("soldOut") : fmtPrice(item.price_cents)}
        </div>
      </div>

      {/* Right: add + fav */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
        <button
          type="button"
          onClick={handleAdd}
          disabled={soldOut}
          style={{
            background: soldOut ? "rgba(26,54,104,.2)" : justAdded ? "#059669" : accent,
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "6px 12px",
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: "0.5px",
            cursor: soldOut ? "not-allowed" : "pointer",
            transition: "background .2s ease",
          }}
        >
          {justAdded ? "✓" : soldOut ? "—" : "+"}
        </button>
        <button
          type="button"
          onClick={onFav}
          style={{ background: "none", border: "none", fontSize: 13, cursor: "pointer", color: isFaved ? "#FF4D6D" : muted }}
        >
          {isFaved ? "♥" : "♡"}
        </button>
      </div>
    </div>
  );
}
