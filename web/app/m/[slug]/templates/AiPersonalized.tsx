"use client";
import { IconShoppingCart } from "@tabler/icons-react";

import { useMemo } from "react";
import type { MenuTemplateProps } from "./types";
import type { PublicMenuItem } from "../page";
import { EmptyMenu } from "./shared/EmptyMenu";
import { fmtPrice } from "./shared/format";
import { useMenuPalette } from "./shared/paletteContext";

/**
 * AiPersonalized (#18 AI-Personalized Menu). The menu re-ranks itself per person:
 * an assistant opens with a one-tap guess, every card carries a match score and a
 * reason, and search is a conversation. Ported from the Menu Systems Board #18
 * mock, themed with public-menu tokens.
 *
 * Note: scores/reasons are deterministic mock signals (no real personalization).
 * MenuPageClient suppresses the shared CartFAB — the composer bar holds the cart.
 */

const REASONS = [
  "Porque te gustan los clásicos",
  "Popular con gustos como el tuyo",
  "Combina con lo que sueles pedir",
  "Tendencia esta semana",
  "Recomendado por el chef",
  "Ligero y fresco, como prefieres",
  "Muy pedido a esta hora",
];


export default function AiPersonalized({
  business,
  categories,
  onItemAdd,
  cartCount,
  onOpenCart,
}: MenuTemplateProps) {
  const P = useMenuPalette();
  const items = useMemo(() => categories.flatMap((c) => c.items), [categories]);

  if (items.length === 0) {
    return <EmptyMenu bizName={business.name} />;
  }

  const first = items[0];

  return (
    <div style={{ background: P.bg, minHeight: "100vh", maxWidth: 680, margin: "0 auto", paddingBottom: 90 }}>
      {/* Gradient header */}
      <div style={{ background: (P.accentGradient ?? P.accent), color: "#fff", padding: "18px 20px 20px", borderRadius: "0 0 22px 22px" }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.3px" }}>{business.name}</div>
        <div style={{ fontSize: 12, opacity: 0.85, marginTop: 3 }}>Hoy · seleccionado para ti</div>
      </div>

      <div style={{ padding: "0 16px" }}>
        {/* Assistant card */}
        <div style={{ marginTop: -10, background: P.surfaceElevated, border: `1px solid ${P.border}`, borderRadius: 18, padding: "14px 16px", boxShadow: "0 8px 24px rgba(0,0,0,0.25)" }}>
          <div style={{ fontSize: 13.5, lineHeight: 1.5, color: P.text }}>
            ¿Lo de siempre? <b>{first.name}</b> — ¿o probamos algo distinto hoy?
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => onItemAdd(first)}
              style={{ background: (P.accentGradient ?? P.accent), color: "#fff", border: "none", borderRadius: 999, fontSize: 12, fontWeight: 700, padding: "9px 16px", cursor: "pointer" }}
            >
              Sí — agregar +
            </button>
            <button
              type="button"
              onClick={onOpenCart}
              style={{ background: "transparent", color: P.textMuted, border: `1px solid ${P.border}`, borderRadius: 999, fontSize: 12, fontWeight: 700, padding: "9px 16px", cursor: "pointer" }}
            >
              Muéstrame algo nuevo
            </button>
          </div>
        </div>

        {/* Ranked list */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "22px 2px 12px" }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: P.text }}>Recomendado para ti</span>
          <span style={{ fontSize: 10.5, color: P.textFaint }}>● actualiza en vivo</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {items.map((item, i) => (
            <RankedCard key={item.id} item={item} score={Math.max(68, 98 - i * 3)} reason={REASONS[i % REASONS.length]} onItemAdd={onItemAdd} />
          ))}
        </div>
      </div>

      {/* Composer bar */}
      <div style={{ position: "fixed", left: "50%", bottom: 14, transform: "translateX(-50%)", width: "calc(100% - 24px)", maxWidth: 656, zIndex: 30, display: "flex", alignItems: "center", gap: 8, padding: "8px 8px 8px 16px", borderRadius: 999, background: P.surfaceElevated, border: `1px solid ${P.border}`, boxShadow: "0 12px 28px rgba(0,0,0,0.4)" }}>
        <input
          placeholder="Pídeme lo que sea… «algo caliente»"
          style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: P.text, fontSize: 13 }}
        />
        <button
          type="button"
          onClick={onOpenCart}
          aria-label={`Ver carrito, ${cartCount} artículos`}
          style={{ position: "relative", width: 40, height: 40, borderRadius: "50%", border: "none", background: (P.accentGradient ?? P.accent), color: "#fff", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
        >
          <IconShoppingCart size={18} />
          {cartCount > 0 && (
            <span style={{ position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 99, background: P.accent, color: P.accentText, fontSize: 10, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px", border: `2px solid ${P.bg}` }}>{cartCount}</span>
          )}
        </button>
      </div>
    </div>
  );
}

function RankedCard({
  item,
  score,
  reason,
  onItemAdd,
}: {
  item: PublicMenuItem;
  score: number;
  reason: string;
  onItemAdd: (item: PublicMenuItem) => void;
}) {
  const P = useMenuPalette();
  const soldOut = item.stock_count !== null && item.stock_count === 0;
  return (
    <div style={{ display: "flex", gap: 12, background: P.surfaceElevated, border: `1px solid ${P.border}`, borderRadius: 16, padding: 10 }}>
      {item.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.photo_url} alt={item.name} style={{ width: 66, height: 66, borderRadius: 12, objectFit: "cover", flexShrink: 0 }} />
      ) : (
        <div style={{ width: 66, height: 66, borderRadius: 12, background: P.surface, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0 }}>🍽️</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: P.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
          <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, color: P.accent, background: P.accentSoft, borderRadius: 999, padding: "2px 8px" }}>{score}% match</span>
        </div>
        <div style={{ fontSize: 11, fontStyle: "italic", color: P.textFaint, marginTop: 3 }}>{reason}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: P.price }}>{soldOut ? "Agotado" : fmtPrice(item.price_cents)}</span>
          <button
            type="button"
            onClick={() => !soldOut && onItemAdd(item)}
            disabled={soldOut}
            aria-label={`Agregar ${item.name}`}
            style={{ width: 30, height: 30, borderRadius: "50%", border: "none", background: soldOut ? P.surface : P.accent, color: "#fff", fontSize: 18, lineHeight: 1, cursor: soldOut ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
