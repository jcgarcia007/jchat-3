"use client";
import { IconShoppingCart } from "@tabler/icons-react";

import { useState, useMemo } from "react";
import { getCategoryIcon } from "@/lib/categoryIcons";
import type { MenuTemplateProps } from "./types";
import { EmptyMenu } from "./shared/EmptyMenu";
import { fmtPrice } from "./shared/format";
import { useMenuPalette } from "./shared/paletteContext";

/**
 * Stories (#15 Story Navigation). The menu told like Instagram stories:
 * categories are avatar rings, each item is a full-screen frame with segmented
 * progress bars, tap right to advance / left to go back, and a button to add.
 * Ported from the Menu Systems Board #15 mock, themed with public-menu tokens.
 *
 * Web adaptation: taps on left/right zones + ‹ › buttons (no real drag gestures).
 * MenuPageClient suppresses the shared CartFAB — the header cart-icon pill is the cart.
 */

export default function Stories({
  business,
  categories,
  onItemAdd,
  cartCount,
  onOpenCart,
}: MenuTemplateProps) {
  const P = useMenuPalette();
  const nonEmpty = categories.filter((c) => c.items.length > 0);
  const [current, setCurrent] = useState(0);

  const flat = useMemo(
    () => nonEmpty.flatMap((c) => c.items.map((item) => ({ item, catId: c.id }))),
    [nonEmpty]
  );
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

  const idx = Math.min(current, flat.length - 1);
  const { item, catId } = flat[idx];
  const soldOut = item.stock_count !== null && item.stock_count === 0;

  const next = () => setCurrent((c) => Math.min(c + 1, flat.length - 1));
  const prev = () => setCurrent((c) => Math.max(c - 1, 0));

  return (
    <div style={{ position: "relative", height: "100vh", overflow: "hidden", background: P.bg }}>
      {/* Photo */}
      {item.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.photo_url} alt={item.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <div style={{ position: "absolute", inset: 0, background: "#111", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 64 }}>🍽️</div>
      )}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.62) 0%, transparent 26%, transparent 50%, rgba(0,0,0,0.88) 100%)" }} />

      {/* Tap zones */}
      <button type="button" aria-label="Anterior" onClick={prev} style={{ position: "absolute", left: 0, top: 130, bottom: 200, width: "35%", background: "transparent", border: "none", cursor: "pointer", zIndex: 5 }} />
      <button type="button" aria-label="Siguiente" onClick={next} style={{ position: "absolute", right: 0, top: 130, bottom: 200, width: "65%", background: "transparent", border: "none", cursor: "pointer", zIndex: 5 }} />

      {/* Progress segments */}
      <div style={{ position: "absolute", top: 10, left: 12, right: 12, zIndex: 10, display: "flex", gap: 3 }}>
        {flat.map((f, i) => (
          <span key={f.item.id} style={{ flex: 1, height: 2.5, borderRadius: 2, background: i <= idx ? "#fff" : "rgba(255,255,255,0.35)" }} />
        ))}
      </div>

      {/* Category rings + cart */}
      <div style={{ position: "absolute", top: 22, left: 0, right: 0, zIndex: 10, display: "flex", alignItems: "center", gap: 10, padding: "0 14px" }}>
        <div style={{ display: "flex", gap: 10, overflowX: "auto", scrollbarWidth: "none", flex: 1 }}>
          {nonEmpty.map((c) => {
            const on = c.id === catId;
            const TablerIcon = getCategoryIcon(c.icon);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCurrent(firstIndexOf[c.id] ?? 0)}
                aria-label={c.name}
                style={{
                  flexShrink: 0,
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  border: on ? `2px solid ${P.accent}` : "2px solid rgba(255,255,255,0.4)",
                  background: "rgba(255,255,255,0.12)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                {TablerIcon ? <TablerIcon size={18} stroke={1.5} color="#fff" /> : <span style={{ fontSize: 14, fontWeight: 800 }}>{c.name.charAt(0).toUpperCase()}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Header line */}
      <div style={{ position: "absolute", top: 74, left: 14, right: 14, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: "#fff", letterSpacing: "0.3px" }}>
          {business.name} · {idx + 1}/{flat.length}
        </span>
        <button
          type="button"
          onClick={onOpenCart}
          aria-label={`Ver carrito, ${cartCount} artículos`}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.14)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
        >
          <IconShoppingCart size={15} style={{ verticalAlign: "-2px", marginRight: 3 }} />{cartCount}
        </button>
      </div>

      {/* Bottom info panel */}
      <div style={{ position: "absolute", left: 18, right: 18, bottom: 28, zIndex: 10 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", lineHeight: 1.1 }}>{item.name}</div>
        {item.description && (
          <div style={{ fontSize: 13.5, color: "rgba(255,255,255,0.8)", marginTop: 8, lineHeight: 1.5 }}>{item.description}</div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: P.price }}>
            {soldOut ? "Agotado" : fmtPrice(item.price_cents)}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
          <button type="button" onClick={prev} aria-label="Anterior" style={navBtn}>‹</button>
          <button
            type="button"
            onClick={() => !soldOut && onItemAdd(item)}
            disabled={soldOut}
            style={{
              flex: 1,
              padding: "13px 18px",
              borderRadius: 14,
              border: "none",
              background: soldOut ? "rgba(255,255,255,0.2)" : P.accent,
              color: P.accentText,
              fontSize: 14,
              fontWeight: 800,
              cursor: soldOut ? "not-allowed" : "pointer",
            }}
          >
            ↑ Deslizar para agregar
          </button>
          <button type="button" onClick={next} aria-label="Siguiente" style={navBtn}>›</button>
        </div>
      </div>
    </div>
  );
}

const navBtn: React.CSSProperties = {
  width: 44,
  height: 44,
  flexShrink: 0,
  borderRadius: "50%",
  border: "1px solid rgba(255,255,255,0.3)",
  background: "rgba(255,255,255,0.14)",
  color: "#fff",
  fontSize: 22,
  lineHeight: 1,
  cursor: "pointer",
};
