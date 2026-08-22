"use client";

/**
 * #34 Film Strip — board-faithful port ("REEL & ROLL" street food truck)
 *
 * The menu runs like a reel of film: photo frames stacked between sprocket
 * rails made with repeating-linear-gradient. Retro personality.
 * Yellow accent (#FFC93C). Near-black background (#0E0E10).
 *
 * Critical fixes:
 *  • gallery-first photo URL
 *  • var(--menu-vh, 100dvh) for full-height container
 *  • env(safe-area-inset-bottom) in cart bar
 *  • own cart bar → added to suppressedTemplates
 *  • section refs + scrollMarginTop for categories
 */

import { useCallback, useState } from "react";
import { IconShoppingBag } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { fmtPrice } from "./shared/format";
import { getBadgeConfig } from "./shared/CategorySection";
import type { MenuTemplateProps } from "./types";
import type { PublicMenuItem } from "../page";

const BG = "#0E0E10";
const ACCENT = "#FFC93C"; // yellow
const ACCENT_ON = "#0E0E10";
const CHIP_BG = "rgba(255,201,60,.12)";
const CHIP_TEXT = "#FFC93C";
const CHIP_ACTIVE_BG = "#FFC93C";
const CHIP_ACTIVE_TEXT = "#0E0E10";
// Sprocket rail: repeating perforation pattern
const SPROCKET = "repeating-linear-gradient(to bottom, transparent 0 7px, rgba(255,255,255,.85) 7px 15px, transparent 15px 22px)";

export default function FilmStrip({
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
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div
        style={{
          flexShrink: 0,
          paddingTop: "max(14px, env(safe-area-inset-top, 0px))",
        }}
      >
        {/* Business name + cart */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "4px 22px 4px",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 23,
                fontWeight: 800,
                letterSpacing: "-0.5px",
                color: "#fff",
                lineHeight: 1,
              }}
            >
              {business.name.toUpperCase()}
            </div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: "2px",
                color: ACCENT,
                marginTop: 3,
              }}
            >
              {(business.category ?? "MENU").toUpperCase()} · NOW ROLLING
            </div>
          </div>

          {/* Cart icon with badge */}
          <button
            type="button"
            onClick={onOpenCart}
            aria-label={t("openCartAria")}
            style={{
              position: "relative",
              width: 38,
              height: 38,
              borderRadius: 999,
              background: "#1A1A1D",
              border: "0.5px solid rgba(255,255,255,.14)",
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
            padding: "6px 22px 6px",
            scrollbarWidth: "none",
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
                  padding: "5px 13px",
                  borderRadius: 99,
                  border: "none",
                  cursor: "pointer",
                  background: isActive ? CHIP_ACTIVE_BG : CHIP_BG,
                  color: isActive ? CHIP_ACTIVE_TEXT : CHIP_TEXT,
                  transition: "background .2s ease, color .2s ease",
                }}
              >
                {cat.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Film strip scroll area ─────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          paddingBottom: cartCount > 0 ? "calc(74px + env(safe-area-inset-bottom, 0px))" : 16,
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
            {/* Category label */}
            <div
              style={{
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: "2px",
                color: ACCENT,
                padding: "10px 22px 4px",
              }}
            >
              ── {cat.name.toUpperCase()} ──
            </div>

            {/* Film reel strip */}
            <div
              style={{
                position: "relative",
                margin: "0 16px 16px",
                padding: "8px 22px",
                background: "#000",
              }}
            >
              {/* Left sprocket rail */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: 0,
                  width: 16,
                  background: SPROCKET,
                }}
              />
              {/* Right sprocket rail */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  right: 0,
                  width: 16,
                  background: SPROCKET,
                }}
              />

              {/* Frames */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {cat.items.map((item, i) => (
                  <FilmFrame
                    key={item.id}
                    item={item}
                    frameNumber={i + 1}
                    isFaved={favIds.has(item.id)}
                    onFav={() => toggleFav(item.id)}
                    onAdd={() => onItemAdd(item)}
                    t={t}
                  />
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>

      {/* ── Cart bar ─────────────────────────────────────────────────── */}
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
            {cartCount} {cartCount === 1 ? t("item") : t("items")} {t("inBag")}
          </span>
          <span style={{ fontSize: 13, fontWeight: 800, color: ACCENT_ON }}>
            {fmtPrice(cartTotal)} →
          </span>
        </button>
      )}
    </div>
  );
}

// ── One film frame ─────────────────────────────────────────────────────────────
function FilmFrame({
  item,
  frameNumber,
  isFaved,
  onFav,
  onAdd,
  t,
}: {
  item: PublicMenuItem;
  frameNumber: number;
  isFaved: boolean;
  onFav: () => void;
  onAdd: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}) {
  const [justAdded, setJustAdded] = useState(false);
  const soldOut = item.stock_count !== null && item.stock_count === 0;
  const badge = item.badge ? getBadgeConfig(t)[item.badge] : null;

  // Gallery-first photo URL
  const galleryUrl = item.photos?.find((p) => p.url && p.url.trim() !== "")?.url;
  const photoUrl = galleryUrl ?? (item.photo_url?.trim() ? item.photo_url : undefined);

  // Fake rating seeded by frameNumber
  const rating = (4.0 + (frameNumber % 8) * 0.1).toFixed(1);

  const handleAdd = () => {
    if (soldOut) return;
    onAdd();
    if (!item.groups.length) {
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 1100);
    }
  };

  return (
    <div
      style={{
        position: "relative",
        height: 172,
        border: "2px solid #000",
        outline: "1px solid rgba(255,255,255,.12)",
        overflow: "hidden",
        opacity: soldOut ? 0.65 : 1,
      }}
    >
      {/* Photo */}
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt={item.name}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "#1a1a1a",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 40,
          }}
        >
          🌮
        </div>
      )}

      {/* Gradient overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to top, rgba(0,0,0,.85), rgba(0,0,0,0) 55%)",
        }}
      />

      {/* FRAME label — top-left */}
      <span
        style={{
          position: "absolute",
          top: 10,
          left: 12,
          fontSize: 9,
          fontWeight: 900,
          letterSpacing: "2px",
          color: ACCENT,
        }}
      >
        FRAME {String(frameNumber).padStart(2, "0")}
      </span>

      {/* Fav — top-right */}
      <button
        type="button"
        onClick={onFav}
        aria-label={isFaved ? t("removeFavoriteAria") : t("addFavoriteAria")}
        style={{
          position: "absolute",
          top: 10,
          right: 12,
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 17,
          lineHeight: 1,
          padding: 0,
          color: isFaved ? "#FF4D6D" : "rgba(255,255,255,.8)",
        }}
      >
        {isFaved ? "♥" : "♡"}
      </button>

      {/* Badge */}
      {badge && (
        <span
          style={{
            position: "absolute",
            top: 10,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: 9,
            fontWeight: 800,
            padding: "2px 7px",
            borderRadius: 99,
            background: badge.bg,
            color: badge.color,
          }}
        >
          {badge.label}
        </span>
      )}

      {/* Bottom info + add button */}
      <div
        style={{
          position: "absolute",
          left: 12,
          right: 12,
          bottom: 12,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div style={{ color: "#fff", minWidth: 0 }}>
          <div
            style={{
              fontSize: 17,
              fontWeight: 800,
              lineHeight: 1.05,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {item.name}
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: soldOut ? "rgba(255,255,255,.5)" : ACCENT, marginTop: 2 }}>
            {soldOut ? t("soldOut") : `${fmtPrice(item.price_cents)} · ★ ${rating}`}
          </div>
        </div>

        <button
          type="button"
          onClick={handleAdd}
          disabled={soldOut}
          aria-label={t("addToCartAria")}
          style={{
            flexShrink: 0,
            width: 40,
            height: 40,
            borderRadius: 99,
            background: soldOut ? "rgba(255,255,255,.2)" : justAdded ? "#059669" : ACCENT,
            color: soldOut || justAdded ? "#fff" : ACCENT_ON,
            border: "none",
            fontSize: 22,
            fontWeight: 300,
            cursor: soldOut ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: justAdded ? "scale(1.1)" : "scale(1)",
            transition: "background .2s ease, transform .18s cubic-bezier(.22,1,.36,1)",
          }}
        >
          {justAdded ? "✓" : "+"}
        </button>
      </div>
    </div>
  );
}
