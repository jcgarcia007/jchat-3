"use client";

/**
 * #40 Curved Hero — board-faithful port ("BOTANICA" garden café & terrace)
 *
 * A full-width hero photo with a convex arc clipping its bottom edge — a soft
 * teardrop that bleeds the photo into the white content area below.
 * Items scroll naturally beneath as a simple ingredient-forward list.
 *
 * BG: #FDFAF5 (warm white) · Accent: #4A7C3B (leaf green) · Playfair Display title
 *
 * Critical fixes:
 *  • gallery-first photo URL  (hero uses first item; items use their own)
 *  • var(--menu-vh, 100dvh) for hero height calculation
 *  • env(safe-area-inset-bottom) in cart bar
 *  • own cart bar → suppressedTemplates
 *  • own header → showBusinessHeader exclusion
 *  • section refs + scrollMarginTop: 56
 */

import { useCallback, useState } from "react";
import { IconShoppingBag } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { fmtPrice } from "./shared/format";
import type { MenuTemplateProps } from "./types";
import type { PublicMenuItem } from "../page";

const BG = "#FDFAF5";
const ACCENT = "#4A7C3B"; // leaf green
const ACCENT_ON = "#FFFFFF";
const TEXT = "#1A2B0F";
const MUTED = "#6B7A62";
const BORDER = "#E4EAE0";
const CHIP_BG = "rgba(74,124,59,.08)";
const CHIP_TEXT = "#4A7C3B";
const CHIP_ACTIVE_BG = "#4A7C3B";
const CHIP_ACTIVE_TEXT = "#fff";
const HERO_GRAD = "linear-gradient(to top, rgba(253,250,245,.95) 0%, rgba(253,250,245,.2) 38%, rgba(253,250,245,0) 65%)";

export default function CurvedHero({
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

  // Use first item of first category as hero photo
  const heroItem = categories[0]?.items[0];
  const heroGallery = heroItem?.photos?.find((p) => p.url && p.url.trim() !== "")?.url;
  const heroPhoto = heroGallery ?? (heroItem?.photo_url?.trim() ? heroItem.photo_url : undefined);

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
      {/* ── Hero with curved bottom ─────────────────────────────────── */}
      <div
        style={{
          position: "relative",
          height: "42vw",
          maxHeight: 280,
          minHeight: 180,
          flexShrink: 0,
          overflow: "hidden",
          // Convex arc at bottom via clip-path ellipse
          clipPath: "ellipse(75% 100% at 50% 0%)",
        }}
      >
        {heroPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroPhoto}
            alt={business.name}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div style={{ position: "absolute", inset: 0, background: "#C8D5C2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 72 }}>🌿</div>
        )}
        {/* gradient overlay for text legibility */}
        <div style={{ position: "absolute", inset: 0, background: HERO_GRAD }} />

        {/* Status bar area */}
        <div style={{ position: "absolute", top: "max(16px, env(safe-area-inset-top, 0px))", right: 18, zIndex: 5 }}>
          <button
            type="button"
            onClick={onOpenCart}
            aria-label={t("openCartAria")}
            style={{
              position: "relative",
              width: 38,
              height: 38,
              borderRadius: 999,
              background: "rgba(253,250,245,.85)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              border: "none",
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
      </div>

      {/* ── Business name & subtitle ───────────────────────────────── */}
      <div style={{ padding: "14px 24px 4px", textAlign: "center", flexShrink: 0 }}>
        <div
          style={{
            fontFamily: "var(--font-playfair), 'Playfair Display', Georgia, serif",
            fontSize: 28,
            color: TEXT,
            lineHeight: 1,
            marginBottom: 4,
          }}
        >
          {business.name}
        </div>
        <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "2.5px", color: ACCENT, textTransform: "uppercase" }}>
          {business.category ?? "Menu"}
        </div>
      </div>

      {/* ── Category chips ────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: 8,
          overflowX: "auto",
          padding: "8px 24px 6px",
          scrollbarWidth: "none",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {categories.map((cat) => {
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => scrollToCategory(cat.id)}
              style={{
                flexShrink: 0,
                fontSize: 11,
                fontWeight: 700,
                padding: "5px 14px",
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

      {/* ── Item list ─────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          paddingBottom: cartCount > 0 ? "calc(74px + env(safe-area-inset-bottom, 0px))" : 20,
        }}
      >
        {categories.map((cat) => (
          <section
            key={cat.id}
            id={`cat-${cat.id}`}
            style={{ scrollMarginTop: 56 }}
            ref={(el) => {
              if (el) sectionRefs.current.set(cat.id, el);
              else sectionRefs.current.delete(cat.id);
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: "2px",
                color: "rgba(74,124,59,.4)",
                padding: "10px 24px 4px",
                textTransform: "uppercase",
              }}
            >
              {cat.name}
            </div>

            {cat.items.map((item) => (
              <CurvedItem
                key={item.id}
                item={item}
                isFaved={favIds.has(item.id)}
                onFav={() => toggleFav(item.id)}
                onAdd={() => onItemAdd(item)}
                t={t}
                accent={ACCENT}
                muted={MUTED}
                border={BORDER}
                text={TEXT}
              />
            ))}
          </section>
        ))}
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

// ── Single item row ───────────────────────────────────────────────────────────
function CurvedItem({
  item, isFaved, onFav, onAdd, t, accent, muted, border, text,
}: {
  item: PublicMenuItem; isFaved: boolean; onFav: () => void; onAdd: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any; accent: string; muted: string; border: string; text: string;
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
        alignItems: "center",
        padding: "10px 24px",
        borderBottom: `0.5px solid ${border}`,
        gap: 14,
      }}
    >
      {/* Photo */}
      {photoUrl ? (
        <div style={{ width: 64, height: 64, borderRadius: 16, overflow: "hidden", flexShrink: 0, position: "relative" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl} alt={item.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      ) : (
        <div style={{ width: 64, height: 64, borderRadius: 16, background: "#E4EAE0", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>🌱</div>
      )}

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: text, lineHeight: 1.2 }}>{item.name}</div>
        {item.description && (
          <div style={{ fontSize: 11, color: muted, lineHeight: 1.4, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.description}
          </div>
        )}
        <div style={{ fontSize: 14, fontWeight: 800, color: accent, marginTop: 4 }}>
          {soldOut ? t("soldOut") : fmtPrice(item.price_cents)}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
        <button
          type="button"
          onClick={handleAdd}
          disabled={soldOut}
          aria-label={t("addToCartAria")}
          style={{
            width: 36,
            height: 36,
            borderRadius: 99,
            background: soldOut ? "rgba(74,124,59,.15)" : justAdded ? "#059669" : accent,
            color: "#fff",
            border: "none",
            fontSize: 20,
            fontWeight: 300,
            cursor: soldOut ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: justAdded ? "scale(1.1)" : "scale(1)",
            transition: "background .2s ease, transform .18s cubic-bezier(.22,1,.36,1)",
          }}
        >
          {justAdded ? "✓" : soldOut ? "—" : "+"}
        </button>
        <button
          type="button"
          onClick={onFav}
          style={{ background: "none", border: "none", fontSize: 15, cursor: "pointer", color: isFaved ? "#FF4D6D" : muted }}
        >
          {isFaved ? "♥" : "♡"}
        </button>
      </div>
    </div>
  );
}
