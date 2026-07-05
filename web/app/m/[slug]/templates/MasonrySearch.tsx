"use client";

import { useState, useMemo } from "react";
import type { MenuTemplateProps } from "./types";
import type { PublicMenuItem } from "../page";
import { EmptyMenu } from "./shared/EmptyMenu";
import { fmtPrice } from "./shared/format";
import { MENU_PALETTES } from "./shared/palettes";

/**
 * MasonrySearch (#10 Pinterest Masonry · Search First). Discovery over
 * navigation: a giant search prompt is the front door, categories exist only as
 * removable filter tokens, and results pour into an uneven masonry wall. Ported
 * from the Menu Systems Board #10 mock, themed with public-menu tokens.
 *
 * Note: search-first, so no scroll-spy (sectionRefs/activeCategory unused). A
 * local category filter + text query drive the wall. MenuPageClient suppresses
 * the shared CartFAB — the bottom cart strip is this template's affordance.
 */

// A masonry card: photo at natural aspect (variable height) + info below.
function MasonryCard({
  item,
  onItemAdd,
}: {
  item: PublicMenuItem;
  onItemAdd: (item: PublicMenuItem) => void;
}) {
  const soldOut = item.stock_count !== null && item.stock_count === 0;
  return (
    <div
      style={{
        breakInside: "avoid",
        marginBottom: 12,
        background: P.surfaceElevated,
        border: `1px solid ${P.border}`,
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      {item.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.photo_url} alt={item.name} style={{ width: "100%", height: "auto", display: "block" }} />
      ) : (
        <div style={{ width: "100%", height: 120, background: P.surface, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>🍽️</div>
      )}
      <div style={{ padding: "10px 12px 12px" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: P.text, lineHeight: 1.3 }}>{item.name}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: P.price }}>
            {soldOut ? "Agotado" : fmtPrice(item.price_cents)}
          </span>
          <button
            type="button"
            onClick={() => !soldOut && onItemAdd(item)}
            disabled={soldOut}
            aria-label={`Agregar ${item.name}`}
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              border: "none",
              background: soldOut ? P.surface : P.accent,
              color: "#fff",
              fontSize: 17,
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
}

const P = MENU_PALETTES["masonry-search"]!;

export default function MasonrySearch({
  business,
  categories,
  onItemAdd,
  cartCount,
  cartTotal,
  onOpenCart,
}: MenuTemplateProps) {
  const nonEmpty = categories.filter((c) => c.items.length > 0);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const base = selectedCategory ? nonEmpty.filter((c) => c.id === selectedCategory) : nonEmpty;
    const q = query.trim().toLowerCase();
    return base
      .flatMap((c) => c.items)
      .filter((it) => !q || it.name.toLowerCase().includes(q) || (it.description ?? "").toLowerCase().includes(q));
  }, [nonEmpty, selectedCategory, query]);

  if (nonEmpty.length === 0) {
    return <EmptyMenu bizName={business.name} />;
  }

  return (
    <div style={{ background: P.bg, minHeight: "100vh", maxWidth: 680, margin: "0 auto", padding: "14px 16px 96px" }}>
      {/* Prompt + avatar */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: P.textFaint, marginBottom: 4 }}>
            {business.name}
          </div>
          <h1 style={{ fontSize: 27, fontWeight: 600, letterSpacing: "-0.5px", color: P.text, margin: 0, lineHeight: 1.15 }}>
            ¿Qué se te antoja hoy?
          </h1>
        </div>
        <div
          style={{
            width: 40,
            height: 40,
            flexShrink: 0,
            borderRadius: "50%",
            background: `linear-gradient(135deg, ${P.accent}, ${P.price})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 15,
            fontWeight: 800,
            color: "#fff",
          }}
        >
          {business.name.charAt(0).toUpperCase()}
        </div>
      </div>

      {/* Search field */}
      <div
        style={{
          marginTop: 14,
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: P.surfaceElevated,
          border: `1px solid ${P.border}`,
          borderRadius: 14,
          padding: "10px 14px",
        }}
      >
        <span style={{ fontSize: 16, color: P.textFaint }}>⌕</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar platillos…"
          style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: P.text, fontSize: 14 }}
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="Limpiar" style={{ background: "none", border: "none", color: P.textFaint, cursor: "pointer", fontSize: 16 }}>
            ×
          </button>
        )}
      </div>

      {/* Category filter tokens */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", scrollbarWidth: "none", marginTop: 12 }}>
        <FilterToken label="Todo" active={selectedCategory === null} onClick={() => setSelectedCategory(null)} />
        {nonEmpty.map((cat) => (
          <FilterToken
            key={cat.id}
            label={cat.name}
            active={selectedCategory === cat.id}
            onClick={() => setSelectedCategory((c) => (c === cat.id ? null : cat.id))}
          />
        ))}
      </div>

      <div style={{ fontSize: 12, color: P.textFaint, margin: "12px 0 14px" }}>
        {results.length} {results.length === 1 ? "resultado" : "resultados"}
      </div>

      {/* Masonry wall */}
      {results.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: P.textFaint, fontSize: 14 }}>
          Sin resultados.
        </div>
      ) : (
        <div style={{ columns: 2, columnGap: 12 }}>
          {results.map((item) => (
            <MasonryCard key={item.id} item={item} onItemAdd={onItemAdd} />
          ))}
        </div>
      )}

      {/* Cart strip */}
      {cartCount > 0 && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            bottom: 16,
            transform: "translateX(-50%)",
            width: "calc(100% - 32px)",
            maxWidth: 648,
            zIndex: 30,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 16px",
            borderRadius: 16,
            background: P.surface,
            border: `1px solid ${P.border}`,
            boxShadow: "0 12px 28px rgba(0,0,0,0.4)",
          }}
        >
          <span style={{ fontSize: 12.5, fontWeight: 700, color: P.text }}>
            {cartCount} {cartCount === 1 ? "artículo" : "artículos"} · {fmtPrice(cartTotal)}
          </span>
          <button
            type="button"
            onClick={onOpenCart}
            style={{
              marginLeft: "auto",
              background: P.accent,
              color: "#fff",
              border: "none",
              fontSize: 12.5,
              fontWeight: 700,
              padding: "10px 18px",
              borderRadius: 999,
              cursor: "pointer",
            }}
          >
            Checkout →
          </button>
        </div>
      )}
    </div>
  );
}

function FilterToken({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flexShrink: 0,
        padding: "6px 14px",
        borderRadius: 999,
        border: active ? `1px solid ${P.accent}` : `1px solid ${P.border}`,
        background: active ? P.accentSoft : P.surfaceElevated,
        color: active ? P.accent : P.textMuted,
        fontSize: 13,
        fontWeight: active ? 700 : 500,
        whiteSpace: "nowrap",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
