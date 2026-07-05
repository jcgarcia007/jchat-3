"use client";
import { IconShoppingCart } from "@tabler/icons-react";

import type { MenuTemplateProps } from "./types";
import type { PublicMenuItem } from "../page";
import { EmptyMenu } from "./shared/EmptyMenu";
import { fmtPrice } from "./shared/format";
import { useMenuPalette } from "./shared/paletteContext";

/**
 * Magazine (#11 Magazine Layout). The menu as an editorial issue: a masthead, a
 * numbered table of contents instead of tabs, one featured dish as a full spread,
 * then two-column "articles" separated by rules. Browsing feels like reading.
 * Ported from the Menu Systems Board #11 mock, themed with public-menu tokens.
 *
 * Note: MenuPageClient suppresses the shared CartFAB — the masthead "Cesta"
 * link is this template's cart affordance.
 */

const SERIF = "var(--font-playfair), Georgia, 'Times New Roman', serif";
// LA TABLE palette — semantic colors from the single source.
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"];

// A compact two-column "article" tile: small photo, serif name, price + add.
function ArticleItem({
  item,
  onItemAdd,
}: {
  item: PublicMenuItem;
  onItemAdd: (item: PublicMenuItem) => void;
}) {
  const P = useMenuPalette();
  const soldOut = item.stock_count !== null && item.stock_count === 0;
  return (
    <div>
      {item.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.photo_url}
          alt={item.name}
          style={{ width: "100%", height: 92, objectFit: "cover", borderRadius: 4, display: "block" }}
        />
      ) : (
        <div style={{ width: "100%", height: 92, borderRadius: 4, background: P.surfaceElevated, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>
          🍽️
        </div>
      )}
      <div style={{ fontSize: 14, fontStyle: "italic", fontFamily: SERIF, color: P.text, marginTop: 6, lineHeight: 1.25 }}>
        {item.name}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: P.accent }}>
          {soldOut ? "Agotado" : fmtPrice(item.price_cents)}
        </span>
        <button
          type="button"
          onClick={() => !soldOut && onItemAdd(item)}
          disabled={soldOut}
          aria-label={`Agregar ${item.name}`}
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            border: `1px solid ${P.border}`,
            background: "transparent",
            color: P.text,
            fontSize: 16,
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
  );
}

export default function Magazine({
  business,
  categories,
  activeCategory,
  scrollToCategory,
  sectionRefs,
  onItemAdd,
  cartCount,
  onOpenCart,
}: MenuTemplateProps) {
  const P = useMenuPalette();
  const nonEmpty = categories.filter((c) => c.items.length > 0);

  if (nonEmpty.length === 0) {
    return <EmptyMenu bizName={business.name} />;
  }

  const featured = nonEmpty[0].items[0];

  return (
    <div style={{ background: P.bg, minHeight: "100vh", maxWidth: 680, margin: "0 auto", padding: "10px 18px 40px" }}>
      {/* Masthead */}
      <div style={{ borderBottom: `2px solid ${P.text}`, paddingBottom: 10, marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <h1 style={{ fontSize: 34, fontWeight: 600, fontFamily: SERIF, color: P.text, margin: 0, letterSpacing: "-0.5px", lineHeight: 1 }}>
            {business.name}
          </h1>
          <button
            type="button"
            onClick={onOpenCart}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12.5, fontStyle: "italic", fontFamily: SERIF, color: P.textMuted, whiteSpace: "nowrap", paddingTop: 6 }}
          >
            <IconShoppingCart size={13} style={{ verticalAlign: "-2px", marginRight: 3 }} />Cesta ({cartCount})
          </button>
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: P.textFaint, marginTop: 6 }}>
          Menú · Nº 1 · {nonEmpty.length} {nonEmpty.length === 1 ? "sección" : "secciones"}
          {business.category ? ` · ${business.category}` : ""}
        </div>
      </div>

      {/* Table of contents */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 20px", padding: "14px 0", borderBottom: `0.5px solid ${P.border}` }}>
        {nonEmpty.map((cat, i) => {
          const active = cat.id === activeCategory;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => scrollToCategory(cat.id)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                textAlign: "left",
                color: active ? P.accent : P.text,
              }}
            >
              <span style={{ fontSize: 12.5, fontStyle: "italic", fontFamily: SERIF, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {ROMAN[i] ?? i + 1}. {cat.name}
              </span>
              <span style={{ fontSize: 11, color: P.textFaint, flexShrink: 0 }}>{cat.items.length}</span>
            </button>
          );
        })}
      </div>

      {/* Feature spread */}
      <div style={{ padding: "20px 0", borderBottom: `0.5px solid ${P.border}` }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "2px", textTransform: "uppercase", color: P.accent, marginBottom: 8 }}>
          El plato de la casa
        </div>
        {featured.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={featured.photo_url} alt={featured.name} style={{ width: "100%", height: 220, objectFit: "cover", borderRadius: 6, display: "block" }} />
        ) : (
          <div style={{ width: "100%", height: 220, borderRadius: 6, background: P.surfaceElevated, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44 }}>🍽️</div>
        )}
        <h2 style={{ fontSize: 26, fontWeight: 600, fontFamily: SERIF, color: P.text, margin: "14px 0 0", lineHeight: 1.1 }}>
          {featured.name}
        </h2>
        {featured.description && (
          <p style={{ fontSize: 13.5, color: P.textMuted, lineHeight: 1.6, margin: "8px 0 0" }}>{featured.description}</p>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 14 }}>
          <span style={{ fontSize: 20, fontWeight: 700, fontFamily: SERIF, color: P.accent }}>{fmtPrice(featured.price_cents)}</span>
          <button
            type="button"
            onClick={() => onItemAdd(featured)}
            style={{
              border: `1px solid ${P.text}`,
              background: "transparent",
              color: P.text,
              borderRadius: 999,
              padding: "9px 20px",
              fontSize: 12.5,
              fontWeight: 700,
              letterSpacing: "0.5px",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Agregar
          </button>
        </div>
      </div>

      {/* Article columns per category */}
      {nonEmpty.map((cat) => {
        const items = cat.items.filter((it) => it.id !== featured.id);
        if (items.length === 0) return null;
        return (
          <section
            key={cat.id}
            id={`cat-${cat.id}`}
            ref={(el) => {
              if (el) sectionRefs.current.set(cat.id, el);
              else sectionRefs.current.delete(cat.id);
            }}
            style={{ scrollMarginTop: 16, padding: "18px 0", borderBottom: `0.5px solid ${P.border}` }}
          >
            <h3 style={{ fontSize: 18, fontWeight: 600, fontFamily: SERIF, color: P.text, margin: "0 0 14px" }}>{cat.name}</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px 18px" }}>
              {items.map((item) => (
                <ArticleItem key={item.id} item={item} onItemAdd={onItemAdd} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
