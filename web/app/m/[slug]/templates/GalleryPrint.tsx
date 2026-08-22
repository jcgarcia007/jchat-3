"use client";

/**
 * #30 Gallery Print — board-faithful port ("Atelier No. 7" fine-dining tasting)
 *
 * One dish hangs like a framed print: the photo floats above an offset gold
 * mat, gallery-style. Serif caption below, a thumbnail rail to change the
 * piece on display. Slow, deliberate, fine-dining aesthetic.
 * Gold accent (#C9A96A). Near-black charcoal background (#0C0A09).
 *
 * Critical fixes:
 *  • gallery-first photo URL
 *  • var(--menu-vh, 100dvh) for full-height container
 *  • env(safe-area-inset-bottom) in cart bar
 *  • own cart bar → added to suppressedTemplates
 */

import { useCallback, useMemo, useState } from "react";
import { IconShoppingBag, IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { fmtPrice } from "./shared/format";
import type { MenuTemplateProps } from "./types";
import type { PublicMenuItem } from "../page";

const BG = "#0C0A09";
const SURFACE = "#151210";
const ACCENT = "#C9A96A"; // gold
const ACCENT_ON = "#0C0A09";
const GOLD_BORDER = "rgba(201,169,106,.4)";
const CHIP_BG = "rgba(201,169,106,.1)";
const CHIP_TEXT = "#C9A96A";
const CHIP_ACTIVE_BG = "rgba(201,169,106,.25)";

export default function GalleryPrint({
  business,
  categories,
  activeCategory,
  scrollToCategory,
  onItemAdd,
  cartCount,
  cartTotal,
  onOpenCart,
}: MenuTemplateProps) {
  const t = useTranslations("menu");
  const [idx, setIdx] = useState(0);
  const [favIds, setFavIds] = useState<Set<string>>(new Set());
  const [justAdded, setJustAdded] = useState(false);
  // Track active category for chip chips
  const [activeCat, setActiveCat] = useState(categories[0]?.id ?? "");

  // Items from active category
  const currentCat = categories.find((c) => c.id === activeCat) ?? categories[0];
  const items = useMemo(() => currentCat?.items ?? [], [currentCat]);
  const item = items[idx] as PublicMenuItem | undefined;

  const goNext = useCallback(() => { setIdx((i) => (i + 1) % items.length); setJustAdded(false); }, [items.length]);
  const goPrev = useCallback(() => { setIdx((i) => (i - 1 + items.length) % items.length); setJustAdded(false); }, [items.length]);

  const toggleFav = useCallback((id: string) => {
    setFavIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleAdd = useCallback(() => {
    if (!item) return;
    onItemAdd(item);
    if (!item.groups.length) {
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 1100);
    }
  }, [item, onItemAdd]);

  const handleCatClick = (catId: string) => {
    setActiveCat(catId);
    setIdx(0);
    setJustAdded(false);
    scrollToCategory(catId);
  };

  if (!item) {
    return (
      <div style={{ height: "var(--menu-vh, 100dvh)", background: BG, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
        {t("noItems")}
      </div>
    );
  }

  // Gallery-first photo
  const galleryUrl = item.photos?.find((p) => p.url && p.url.trim() !== "")?.url;
  const photoUrl = galleryUrl ?? (item.photo_url?.trim() ? item.photo_url : undefined);

  const soldOut = item.stock_count !== null && item.stock_count === 0;
  const isFaved = favIds.has(item.id);
  const rating = (4.3 + (idx % 6) * 0.1).toFixed(1);
  const pieceNum = String(idx + 1).padStart(2, "0");

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
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div
        style={{
          flexShrink: 0,
          paddingTop: "max(14px, env(safe-area-inset-top, 0px))",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "6px 22px 0",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "var(--font-playfair), 'Playfair Display', Georgia, serif",
                fontSize: 26,
                color: "#fff",
                lineHeight: 1,
              }}
            >
              {business.name}
            </div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: "3px",
                color: ACCENT,
                marginTop: 4,
              }}
            >
              {(business.category ?? "THE TASTING").toUpperCase()}
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
              background: SURFACE,
              border: `0.5px solid ${GOLD_BORDER}`,
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
            gap: 20,
            overflowX: "auto",
            padding: "12px 22px 8px",
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
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "6px 16px",
                  borderRadius: 99,
                  border: `0.5px solid ${isActive ? ACCENT : GOLD_BORDER}`,
                  cursor: "pointer",
                  background: isActive ? CHIP_ACTIVE_BG : CHIP_BG,
                  color: CHIP_TEXT,
                  transition: "background .2s ease, border-color .2s ease",
                  letterSpacing: "0.2px",
                }}
              >
                {cat.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Framed print area ─────────────────────────────────────── */}
      <div
        style={{
          flex: "0 0 auto",
          position: "relative",
          margin: "0 40px",
          // Height for the frame: ~320/812 ≈ 39% of viewport
          height: "38%",
        }}
      >
        {/* Gold mat (offset shadow behind photo) */}
        <div
          style={{
            position: "absolute",
            left: 14,
            top: 14,
            right: -14,
            bottom: -14,
            background: ACCENT,
          }}
        />

        {/* Photo frame */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            boxShadow: "0 20px 44px rgba(0,0,0,.5)",
          }}
        >
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt={item.name}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "#1A1510",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 48,
              }}
            >
              🍽️
            </div>
          )}

          {/* Piece number — Playfair, top-left */}
          <div
            style={{
              position: "absolute",
              left: 12,
              top: 12,
              fontFamily: "var(--font-playfair), 'Playfair Display', Georgia, serif",
              fontSize: 34,
              color: "rgba(255,255,255,.85)",
              lineHeight: 1,
            }}
          >
            {pieceNum}
          </div>

          {/* Fav — top-right */}
          <button
            type="button"
            onClick={() => toggleFav(item.id)}
            aria-label={isFaved ? t("removeFavoriteAria") : t("addFavoriteAria")}
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              width: 32,
              height: 32,
              borderRadius: 99,
              background: "rgba(12,10,9,.55)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              cursor: "pointer",
              color: isFaved ? "#FF4D6D" : "rgba(255,255,255,.8)",
            }}
          >
            {isFaved ? "♥" : "♡"}
          </button>
        </div>

        {/* Navigation arrows (outside frame) */}
        {items.length > 1 && (
          <>
            <button
              type="button"
              onClick={goPrev}
              aria-label={t("prevItemAria")}
              style={{
                position: "absolute",
                left: -24,
                top: "50%",
                transform: "translateY(-50%)",
                width: 40,
                height: 40,
                borderRadius: 99,
                background: SURFACE,
                border: `0.5px solid ${GOLD_BORDER}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                zIndex: 5,
              }}
            >
              <IconChevronLeft size={18} color={ACCENT} />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label={t("nextItemAria")}
              style={{
                position: "absolute",
                right: -38,
                top: "50%",
                transform: "translateY(-50%)",
                width: 40,
                height: 40,
                borderRadius: 99,
                background: SURFACE,
                border: `0.5px solid ${GOLD_BORDER}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                zIndex: 5,
              }}
            >
              <IconChevronRight size={18} color={ACCENT} />
            </button>
          </>
        )}
      </div>

      {/* ── Info below frame ─────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "18px 24px 0",
          color: "#fff",
          textAlign: "center",
          minHeight: 0,
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "2px", color: ACCENT }}>
          ★ {rating} · {idx + 1} / {items.length}
        </div>
        <div
          style={{
            fontFamily: "var(--font-playfair), 'Playfair Display', Georgia, serif",
            fontSize: 27,
            lineHeight: 1.06,
            margin: "6px 0",
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {item.name}
        </div>
        {item.description && (
          <div
            style={{
              fontSize: 12,
              lineHeight: 1.5,
              color: "rgba(255,255,255,.6)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {item.description}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 14 }}>
          <button
            type="button"
            onClick={handleAdd}
            disabled={soldOut}
            style={{
              background: soldOut ? "rgba(255,255,255,.08)" : justAdded ? "#059669" : "rgba(255,255,255,.1)",
              border: soldOut ? "none" : `0.5px solid ${justAdded ? "#059669" : GOLD_BORDER}`,
              color: justAdded ? "#fff" : ACCENT,
              borderRadius: 999,
              padding: "12px 26px",
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: "1px",
              cursor: soldOut ? "not-allowed" : "pointer",
              transform: justAdded ? "scale(1.03)" : "scale(1)",
              transition: "background .2s ease, transform .18s cubic-bezier(.22,1,.36,1)",
              whiteSpace: "nowrap",
            }}
          >
            {soldOut
              ? t("unavailable")
              : justAdded
              ? "✓ Added"
              : `ADD · ${fmtPrice(item.price_cents)}`}
          </button>
        </div>
      </div>

      {/* ── Thumbnail rail ──────────────────────────────────────── */}
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          gap: 10,
          overflowX: "auto",
          padding: "12px 22px 12px",
          scrollbarWidth: "none",
          paddingBottom: cartCount > 0 ? "calc(74px + env(safe-area-inset-bottom, 0px))" : 12,
        }}
      >
        {items.map((it, i) => {
          const gUrl = it.photos?.find((p) => p.url && p.url.trim() !== "")?.url;
          const src = gUrl ?? (it.photo_url?.trim() ? it.photo_url : undefined);
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => { setIdx(i); setJustAdded(false); }}
              style={{
                flexShrink: 0,
                width: 54,
                height: 54,
                overflow: "hidden",
                border: i === idx ? `1.5px solid ${ACCENT}` : `0.5px solid ${GOLD_BORDER}`,
                cursor: "pointer",
                padding: 0,
                opacity: i === idx ? 1 : 0.55,
                transition: "opacity .2s ease, border-color .2s ease",
              }}
            >
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt={it.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              ) : (
                <div style={{ width: "100%", height: "100%", background: "#1A1510", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🍽️</div>
              )}
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
            {cartCount} {t("courses")}
          </span>
          <span style={{ fontSize: 13, fontWeight: 800, color: ACCENT_ON }}>
            {fmtPrice(cartTotal)} →
          </span>
        </button>
      )}
    </div>
  );
}
