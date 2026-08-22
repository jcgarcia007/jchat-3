"use client";

/**
 * #31 Photo Spotlight — board-faithful port
 *
 * One enormous photo fills the screen. A floating glass card at the bottom
 * holds the name, description, price and "Add to bag" button. Left / right
 * arrows navigate across ALL menu items (flattened categories). Dot-nav below
 * the glass card shows position. The template carries its own cart-icon button
 * (top-right), so it is added to MenuPageClient's suppressedTemplates list to
 * avoid the shared CartFAB duplicate.
 *
 * Critical fixes applied:
 *  • padding-bottom trick for the hero photo (not CSS aspect-ratio)
 *  • gallery-first photo URL
 *  • var(--menu-vh, 100dvh) for the full-height container
 *  • env(safe-area-inset-bottom) in the bottom card
 */

import { useState, useCallback, useMemo } from "react";
import { IconShoppingBag, IconChevronLeft, IconChevronRight, IconHeart, IconHeartFilled } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { fmtPrice } from "./shared/format";
import { useMenuPalette } from "./shared/paletteContext";
import type { MenuTemplateProps } from "./types";
import type { PublicMenuItem } from "../page";

// ── Design constants (board #31 faithful) ──────────────────────────────────
const BG = "#0A0A0A";
const ACCENT = "#FF4D2E";
const GLASS_BG = "rgba(21,21,21,.72)";
const GLASS_BORDER = "rgba(255,255,255,.14)";
const GLASS_TEXT = "#FFFFFF";
const GLASS_MUTED = "rgba(255,255,255,.6)";
const ARROW_BG = "rgba(0,0,0,.4)";
const ARROW_BORDER = "rgba(255,255,255,.28)";
const GRAD = "linear-gradient(to bottom, rgba(10,10,10,.45), rgba(10,10,10,0) 30%, rgba(10,10,10,.1) 70%, rgba(10,10,10,.9))";

export default function PhotoSpotlight({
  business,
  categories,
  onItemAdd,
  cartCount,
  cartTotal,
  onOpenCart,
}: MenuTemplateProps) {
  const t = useTranslations("menu");
  const palette = useMenuPalette();

  // ── Flatten all items from all categories ──────────────────────────────
  const allItems = useMemo<PublicMenuItem[]>(
    () => categories.flatMap((c) => c.items),
    [categories]
  );

  const [idx, setIdx] = useState(0);
  const [favIds, setFavIds] = useState<Set<string>>(new Set());
  const [justAdded, setJustAdded] = useState(false);

  const item = allItems[idx];

  const goNext = useCallback(() => {
    setJustAdded(false);
    setIdx((i) => (i + 1) % allItems.length);
  }, [allItems.length]);

  const goPrev = useCallback(() => {
    setJustAdded(false);
    setIdx((i) => (i - 1 + allItems.length) % allItems.length);
  }, [allItems.length]);

  const toggleFav = useCallback(() => {
    if (!item) return;
    setFavIds((s) => {
      const next = new Set(s);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }, [item]);

  const handleAdd = useCallback(() => {
    if (!item) return;
    onItemAdd(item);
    if (!item.groups.length) {
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 1100);
    }
  }, [item, onItemAdd]);

  if (!item) {
    return (
      <div style={{ height: "var(--menu-vh, 100dvh)", background: BG, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
        {t("noItems")}
      </div>
    );
  }

  // Gallery-first photo URL
  const galleryUrl = item.photos?.find((p) => p.url && p.url.trim() !== "")?.url;
  const photoUrl = galleryUrl ?? (item.photo_url?.trim() ? item.photo_url : undefined);
  const isFaved = favIds.has(item.id);
  const soldOut = item.stock_count !== null && item.stock_count === 0;

  return (
    <div
      style={{
        position: "relative",
        height: "var(--menu-vh, 100dvh)",
        background: BG,
        overflow: "hidden",
        // force GPU layer so fixed children in iOS respect this stacking context
        transform: "translateZ(0)",
      }}
    >
      {/* ── Hero photo with gradient overlay (padding-bottom trick) ─────── */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "68%", // slightly taller than board's 560/812 ≈ 69%
        }}
      >
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
              background: "#1A1A1A",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 64,
            }}
          >
            🍽️
          </div>
        )}
        {/* Gradient overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: GRAD,
          }}
        />
      </div>

      {/* ── Top bar: business name + cart ─────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          padding: "52px 22px 0",
          zIndex: 10,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 22,
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
            {business.category?.toUpperCase() ?? "MENU"}
          </div>
        </div>

        {/* Cart button */}
        <button
          type="button"
          onClick={onOpenCart}
          aria-label={t("openCartAria")}
          style={{
            width: 40,
            height: 40,
            borderRadius: 99,
            background: ARROW_BG,
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            border: "0.5px solid rgba(255,255,255,.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            position: "relative",
          }}
        >
          <IconShoppingBag size={18} color="#fff" />
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
                color: "#fff",
                fontSize: 10,
                fontWeight: 800,
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

      {/* ── Navigation arrows ─────────────────────────────────────────────── */}
      {allItems.length > 1 && (
        <>
          <button
            type="button"
            onClick={goPrev}
            aria-label={t("prevItemAria")}
            style={{
              position: "absolute",
              left: 14,
              top: "35%",
              width: 42,
              height: 42,
              borderRadius: 99,
              background: ARROW_BG,
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              border: `0.5px solid ${ARROW_BORDER}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              zIndex: 10,
            }}
          >
            <IconChevronLeft size={22} color="#fff" />
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label={t("nextItemAria")}
            style={{
              position: "absolute",
              right: 14,
              top: "35%",
              width: 42,
              height: 42,
              borderRadius: 99,
              background: ARROW_BG,
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              border: `0.5px solid ${ARROW_BORDER}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              zIndex: 10,
            }}
          >
            <IconChevronRight size={22} color="#fff" />
          </button>
        </>
      )}

      {/* ── Glass info card ────────────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          left: 20,
          right: 20,
          bottom: "calc(52px + env(safe-area-inset-bottom, 0px) + 44px)",
          background: GLASS_BG,
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          border: `0.5px solid ${GLASS_BORDER}`,
          borderRadius: 22,
          padding: 20,
          zIndex: 10,
        }}
      >
        {/* Top row: rating / position + fav */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: "2px",
                color: ACCENT,
              }}
            >
              {idx + 1} / {allItems.length}
            </div>
            <div
              style={{
                fontSize: 26,
                fontWeight: 800,
                letterSpacing: "-0.5px",
                color: GLASS_TEXT,
                marginTop: 4,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {item.name}
            </div>
          </div>

          <button
            type="button"
            onClick={toggleFav}
            aria-label={isFaved ? t("removeFavoriteAria") : t("addFavoriteAria")}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              flexShrink: 0,
              color: isFaved ? ACCENT : "rgba(255,255,255,.7)",
            }}
          >
            {isFaved
              ? <IconHeartFilled size={22} color={ACCENT} />
              : <IconHeart size={22} color="rgba(255,255,255,.7)" />
            }
          </button>
        </div>

        {/* Description */}
        {item.description && (
          <div
            style={{
              fontSize: 12.5,
              lineHeight: 1.5,
              color: GLASS_MUTED,
              marginTop: 8,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {item.description}
          </div>
        )}

        {/* Price + Add button */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 16,
          }}
        >
          <span
            style={{
              fontSize: 24,
              fontWeight: 800,
              color: soldOut ? GLASS_MUTED : GLASS_TEXT,
            }}
          >
            {soldOut ? t("soldOut") : fmtPrice(item.price_cents)}
          </span>

          <button
            type="button"
            onClick={handleAdd}
            disabled={soldOut}
            style={{
              background: soldOut
                ? "rgba(255,255,255,.15)"
                : justAdded
                ? "#059669"
                : ACCENT,
              color: "#fff",
              border: "none",
              borderRadius: 14,
              padding: "14px 28px",
              fontSize: 14,
              fontWeight: 800,
              cursor: soldOut ? "not-allowed" : "pointer",
              boxShadow: soldOut || justAdded
                ? "none"
                : "0 10px 24px rgba(255,77,46,.45)",
              transform: justAdded ? "scale(1.05)" : "scale(1)",
              transition: "background .2s ease, transform .18s cubic-bezier(.22,1,.36,1), box-shadow .2s ease",
            }}
          >
            {soldOut ? t("unavailable") : justAdded ? "✓ Added" : t("addToBag")}
          </button>
        </div>
      </div>

      {/* ── Dot navigation ────────────────────────────────────────────────── */}
      {allItems.length > 1 && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)",
            display: "flex",
            gap: 8,
            justifyContent: "center",
            zIndex: 10,
            padding: "0 20px",
            overflowX: "auto",
          }}
        >
          {allItems.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { setIdx(i); setJustAdded(false); }}
              aria-label={`Item ${i + 1}`}
              style={{
                flexShrink: 0,
                width: i === idx ? 24 : 9,
                height: 9,
                borderRadius: 99,
                background: i === idx
                  ? ACCENT
                  : "rgba(255,255,255,.35)",
                border: "none",
                cursor: "pointer",
                padding: 0,
                transition: "width .25s ease, background .2s ease",
              }}
            />
          ))}
        </div>
      )}

      {/* ── Cart total bar (visible when cart has items) ──────────────────── */}
      {cartCount > 0 && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 40px)",
            height: 2,
            background: GLASS_BG,
            zIndex: 5,
          }}
        />
      )}
    </div>
  );
}
