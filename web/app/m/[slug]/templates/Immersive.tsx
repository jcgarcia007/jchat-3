"use client";
import { IconShoppingCart } from "@tabler/icons-react";

import { useState, useRef, useMemo } from "react";
import type { MenuTemplateProps } from "./types";
import { EmptyMenu } from "./shared/EmptyMenu";
import { fmtPrice } from "./shared/format";
import { MENU_PALETTES } from "./shared/palettes";

/**
 * Immersive (#19 Immersive Full-Screen). Each dish owns the entire viewport in a
 * CSS scroll-snap gallery; information sits on a frosted panel over the
 * photography. Page dots track depth; translucent chips switch course. Ported
 * from the Menu Systems Board #19 mock, themed with public-menu tokens.
 *
 * Note: MenuPageClient suppresses the shared CartFAB — the glass cart pill is
 * this template's cart affordance.
 */
const P = MENU_PALETTES["immersive"]!;

export default function Immersive({
  business,
  categories,
  onItemAdd,
  cartCount,
  onOpenCart,
}: MenuTemplateProps) {
  const nonEmpty = categories.filter((c) => c.items.length > 0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);

  // Flat list of items plus, for each, its category id (for chip highlighting).
  const flat = useMemo(
    () => nonEmpty.flatMap((c) => c.items.map((item) => ({ item, catId: c.id }))),
    [nonEmpty]
  );
  // First flat index of each category (chip → scroll target).
  const firstIndexOf = useMemo(() => {
    const map: Record<string, number> = {};
    flat.forEach((f, i) => {
      if (!(f.catId in map)) map[f.catId] = i;
    });
    return map;
  }, [flat]);

  if (flat.length === 0) {
    return <EmptyMenu bizName={business.name} />;
  }

  const activeCatId = flat[Math.min(page, flat.length - 1)].catId;

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const h = el.clientHeight || 1;
    setPage(Math.round(el.scrollTop / h));
  };

  const goToCategory = (catId: string) => {
    const idx = firstIndexOf[catId] ?? 0;
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: idx * el.clientHeight, behavior: "smooth" });
  };

  return (
    <div style={{ position: "relative", height: "100vh", overflow: "hidden", background: P.bg }}>
      {/* Translucent category chips */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 14px",
        }}
      >
        <span style={{ flexShrink: 0, alignSelf: "center", fontSize: 13, fontWeight: 800, letterSpacing: "0.3px", color: "#fff", marginRight: 4, textShadow: "0 1px 4px rgba(0,0,0,0.5)", maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {business.name}
        </span>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", scrollbarWidth: "none", flex: 1 }}>
          {nonEmpty.map((c) => {
            const on = c.id === activeCatId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => goToCategory(c.id)}
                style={{
                  flexShrink: 0,
                  padding: "6px 14px",
                  borderRadius: 999,
                  border: on ? `1px solid ${P.accent}` : "1px solid rgba(255,255,255,0.2)",
                  background: on ? P.accent : "rgba(255,255,255,0.14)",
                  backdropFilter: "blur(10px)",
                  WebkitBackdropFilter: "blur(10px)",
                  color: on ? P.accentText : "#fff",
                  fontSize: 12.5,
                  fontWeight: on ? 700 : 500,
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                }}
              >
                {c.name}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onOpenCart}
          aria-label={`Ver carrito, ${cartCount} artículos`}
          style={{
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 14px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.2)",
            background: "rgba(255,255,255,0.14)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            color: "#fff",
            fontSize: 12.5,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          <IconShoppingCart size={15} style={{ verticalAlign: "-2px", marginRight: 3 }} />{cartCount}
        </button>
      </div>

      {/* Vertical page dots */}
      <div style={{ position: "absolute", right: 12, top: "42%", zIndex: 20, display: "flex", flexDirection: "column", gap: 7 }}>
        {flat.map((f, i) => (
          <span
            key={f.item.id}
            style={{
              width: 5,
              height: i === page ? 16 : 5,
              borderRadius: 999,
              background: i === page ? P.accent : "rgba(255,255,255,0.4)",
            }}
          />
        ))}
      </div>

      {/* Snap gallery */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        style={{ height: "100%", overflowY: "auto", scrollSnapType: "y mandatory", scrollbarWidth: "none" }}
      >
        {flat.map(({ item }) => {
          const soldOut = item.stock_count !== null && item.stock_count === 0;
          return (
            <div key={item.id} style={{ position: "relative", height: "100%", scrollSnapAlign: "start", overflow: "hidden" }}>
              {item.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.photo_url} alt={item.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{ position: "absolute", inset: 0, background: P.surfaceElevated, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 60 }}>🍽️</div>
              )}

              {/* Frosted info panel */}
              <div
                style={{
                  position: "absolute",
                  left: 14,
                  right: 14,
                  bottom: 24,
                  padding: "18px 20px",
                  borderRadius: 24,
                  background: "rgba(12,12,12,0.5)",
                  backdropFilter: "blur(18px)",
                  WebkitBackdropFilter: "blur(18px)",
                  border: "0.5px solid rgba(255,255,255,0.14)",
                }}
              >
                <div style={{ fontSize: 24, fontWeight: 800, color: "#fff", lineHeight: 1.1 }}>{item.name}</div>
                {item.description && (
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 8, lineHeight: 1.5 }}>{item.description}</div>
                )}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 14 }}>
                  <span style={{ fontSize: 20, fontWeight: 800, color: P.price }}>
                    {soldOut ? "Agotado" : fmtPrice(item.price_cents)}
                  </span>
                  <button
                    type="button"
                    onClick={() => !soldOut && onItemAdd(item)}
                    disabled={soldOut}
                    aria-label={`Agregar ${item.name}`}
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      border: "none",
                      background: soldOut ? "rgba(255,255,255,0.2)" : P.accent,
                      color: P.accentText,
                      fontSize: 24,
                      fontWeight: 700,
                      lineHeight: 1,
                      cursor: soldOut ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
