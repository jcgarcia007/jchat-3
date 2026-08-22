"use client";

/**
 * #26 Magazine Cover — board-faithful port ("THE LIST" nightcap cocktail bar)
 *
 * The menu reads like a cover shoot: full-bleed hero photo with a masthead
 * (Playfair Display + issue number), ‹ › arrows to turn the "page", a peek
 * strip of thumbnails at the bottom teasing the rest of the list.
 * Gold accent (#C9A96A). Near-black background (#08070C).
 *
 * Critical fixes:
 *  • gallery-first photo URL
 *  • var(--menu-vh, 100dvh) for full-height container
 *  • env(safe-area-inset-bottom) in cart bar
 *  • own cart bar → added to suppressedTemplates
 */

import { useCallback, useMemo, useState } from "react";
import { IconChevronLeft, IconChevronRight, IconShoppingBag } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { fmtPrice } from "./shared/format";
import type { MenuTemplateProps } from "./types";
import type { PublicMenuItem } from "../page";

const BG = "#08070C";
const ACCENT = "#C9A96A"; // gold
const GRAD = "linear-gradient(to bottom, rgba(8,7,12,.5) 0%, rgba(8,7,12,0) 22%, rgba(8,7,12,0) 46%, rgba(8,7,12,.92))";
const ARROW_BG = "rgba(255,255,255,.12)";
const ARROW_BORDER = "rgba(255,255,255,.28)";
const CART_BG = "rgba(20,17,24,.9)";

export default function MagazineCover({
  business,
  categories,
  onItemAdd,
  cartCount,
  cartTotal,
  onOpenCart,
}: MenuTemplateProps) {
  const t = useTranslations("menu");
  const [idx, setIdx] = useState(0);
  const [favIds, setFavIds] = useState<Set<string>>(new Set());

  // Flatten all items across all categories
  const allItems = useMemo<PublicMenuItem[]>(
    () => categories.flatMap((c) => c.items),
    [categories]
  );

  const item = allItems[idx];

  const goNext = useCallback(() => setIdx((i) => (i + 1) % allItems.length), [allItems.length]);
  const goPrev = useCallback(() => setIdx((i) => (i - 1 + allItems.length) % allItems.length), [allItems.length]);

  const toggleFav = useCallback((id: string) => {
    setFavIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const [justAdded, setJustAdded] = useState(false);
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

  // Gallery-first photo URL for hero
  const galleryUrl = item.photos?.find((p) => p.url && p.url.trim() !== "")?.url;
  const heroPhoto = galleryUrl ?? (item.photo_url?.trim() ? item.photo_url : undefined);

  const soldOut = item.stock_count !== null && item.stock_count === 0;
  const isFaved = favIds.has(item.id);
  const rating = (4.2 + (idx % 5) * 0.15).toFixed(1);
  const issueNum = String(idx + 1).padStart(2, "0");

  return (
    <div
      style={{
        position: "relative",
        height: "var(--menu-vh, 100dvh)",
        background: BG,
        overflow: "hidden",
      }}
    >
      {/* ── Hero photo ─────────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "79%", // ≈640/812 from board
        }}
      >
        {heroPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroPhoto}
            alt={item.name}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div style={{ position: "absolute", inset: 0, background: "#1A1520", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 72 }}>
            🍸
          </div>
        )}
        {/* Gradient */}
        <div style={{ position: "absolute", inset: 0, background: GRAD }} />
      </div>

      {/* ── Masthead ───────────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          top: "max(44px, env(safe-area-inset-top, 0px))",
          left: 24,
          right: 24,
          textAlign: "center",
          zIndex: 10,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-playfair), 'Playfair Display', Georgia, serif",
            fontSize: 34,
            letterSpacing: "4px",
            color: "#fff",
            lineHeight: 1,
          }}
        >
          {business.name.toUpperCase()}
        </div>
        <div
          style={{
            fontSize: 9,
            fontWeight: 900,
            letterSpacing: "3px",
            color: ACCENT,
            marginTop: 4,
          }}
        >
          {(business.category ?? "MENU").toUpperCase()} · ISSUE Nº {issueNum}
        </div>
      </div>

      {/* ── Navigation arrows ──────────────────────────────────────── */}
      {allItems.length > 1 && (
        <>
          <button
            type="button"
            onClick={goPrev}
            aria-label={t("prevItemAria")}
            style={{
              position: "absolute",
              left: 12,
              top: "37%",
              width: 40,
              height: 40,
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
            <IconChevronLeft size={20} color="#fff" />
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label={t("nextItemAria")}
            style={{
              position: "absolute",
              right: 12,
              top: "37%",
              width: 40,
              height: 40,
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
            <IconChevronRight size={20} color="#fff" />
          </button>
        </>
      )}

      {/* ── Feature info block ─────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          left: 24,
          right: 24,
          // leaves room for thumb rail (≈80px) + cart bar (≈58px) + gap
          bottom: "calc(156px + env(safe-area-inset-bottom, 0px))",
          color: "#fff",
          zIndex: 10,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: "2px",
            color: ACCENT,
          }}
        >
          FEATURE · ★ {rating}
        </div>
        <div
          style={{
            fontFamily: "var(--font-playfair), 'Playfair Display', Georgia, serif",
            fontSize: 38,
            lineHeight: 1.02,
            margin: "8px 0",
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
              fontSize: 12.5,
              lineHeight: 1.5,
              color: "rgba(255,255,255,.72)",
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

        {/* Add button + fav */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16 }}>
          <button
            type="button"
            onClick={handleAdd}
            disabled={soldOut}
            style={{
              background: soldOut ? "rgba(255,255,255,.15)" : justAdded ? "#059669" : ACCENT,
              color: soldOut ? "#fff" : justAdded ? "#fff" : BG,
              border: "none",
              borderRadius: 999,
              padding: "13px 24px",
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
              : `ADD TO TAB · ${fmtPrice(item.price_cents)}`}
          </button>

          <button
            type="button"
            onClick={() => toggleFav(item.id)}
            aria-label={isFaved ? t("removeFavoriteAria") : t("addFavoriteAria")}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 24,
              lineHeight: 1,
              padding: 0,
              color: isFaved ? "#FF4D6D" : "rgba(255,255,255,.8)",
            }}
          >
            {isFaved ? "♥" : "♡"}
          </button>
        </div>
      </div>

      {/* ── Peek thumbnail strip ────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: "calc(68px + env(safe-area-inset-bottom, 0px))",
          display: "flex",
          gap: 10,
          overflowX: "auto",
          padding: "0 24px",
          scrollbarWidth: "none",
          zIndex: 10,
        }}
      >
        {allItems.map((it, i) => {
          const gUrl = it.photos?.find((p) => p.url && p.url.trim() !== "")?.url;
          const src = gUrl ?? (it.photo_url?.trim() ? it.photo_url : undefined);
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => { setIdx(i); setJustAdded(false); }}
              style={{
                flexShrink: 0,
                width: 58,
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                opacity: i === idx ? 1 : 0.55,
                transition: "opacity .2s ease",
              }}
            >
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={src}
                  alt={it.name}
                  style={{
                    width: 58,
                    height: 76,
                    borderRadius: 8,
                    objectFit: "cover",
                    border: i === idx
                      ? `1.5px solid ${ACCENT}`
                      : "0.5px solid rgba(201,169,106,.35)",
                    display: "block",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 58,
                    height: 76,
                    borderRadius: 8,
                    background: "#1A1520",
                    border: "0.5px solid rgba(201,169,106,.35)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 20,
                  }}
                >
                  🍸
                </div>
              )}
              <div
                style={{
                  fontSize: 8.5,
                  color: "rgba(201,169,106,.7)",
                  marginTop: 4,
                  textAlign: "center",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {fmtPrice(it.price_cents)}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Cart bar ────────────────────────────────────────────────── */}
      {cartCount > 0 && (
        <button
          type="button"
          onClick={onOpenCart}
          style={{
            position: "absolute",
            left: 16,
            right: 16,
            bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
            background: CART_BG,
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            border: "0.5px solid rgba(255,255,255,.14)",
            borderRadius: 16,
            padding: "12px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            border2: "none",
            zIndex: 30,
          } as React.CSSProperties}
        >
          <span style={{ fontSize: 13, fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", gap: 8 }}>
            <IconShoppingBag size={16} color="#fff" />
            {cartCount} {t("onTheTab")}
          </span>
          <span style={{ fontSize: 13, fontWeight: 800, color: ACCENT }}>
            {fmtPrice(cartTotal)} →
          </span>
        </button>
      )}
    </div>
  );
}
