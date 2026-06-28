"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type {
  PublicBusiness,
  PublicMenuCategory,
  PublicMenuItem,
  MenuItemOption,
} from "./page";

// ── Cart types ────────────────────────────────────────────────────────────────

interface CartItem {
  cartId: string;
  itemId: string;
  name: string;
  basePriceCents: number;
  quantity: number;
  selectedSize: MenuItemOption | null;
  selectedExtras: MenuItemOption[];
  lineTotalCents: number;
}

type AppStep = "menu" | "cart" | "pickup" | "success";
type PickupType = "counter" | "table";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function calcLine(
  base: number,
  size: MenuItemOption | null,
  extras: MenuItemOption[],
  qty: number
): number {
  return ((base + (size?.price_cents ?? 0) + extras.reduce((s, e) => s + e.price_cents, 0)) * qty);
}

const BADGE_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  best_seller: { label: "⭐ Más vendido", bg: "#D97706", color: "#fff" },
  new: { label: "✨ Nuevo", bg: "#059669", color: "#fff" },
  hot: { label: "🌶️ Hot", bg: "#DC2626", color: "#fff" },
};

const DIETARY_LABELS: Record<string, string> = {
  vegetarian: "🌱 Vegetal",
  vegan: "🌿 Vegano",
  gluten_free: "🌾 Sin gluten",
  seafood: "🦐 Mariscos",
  spicy: "🌶️ Picante",
  nut_free: "🥜 Sin nueces",
  dairy_free: "🥛 Sin lácteos",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function BusinessHeader({ biz }: { biz: PublicBusiness }) {
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      {/* Cover */}
      <div
        style={{
          width: "100%",
          height: 220,
          background: biz.cover_url
            ? `url(${biz.cover_url}) center/cover no-repeat`
            : "linear-gradient(135deg, var(--color-brand) 0%, var(--color-brand-purple) 100%)",
          position: "relative",
        }}
        role="img"
        aria-label={`Portada de ${biz.name}`}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(10,10,20,0.85) 100%)",
          }}
        />
      </div>

      {/* Identity */}
      <div
        style={{
          maxWidth: 680,
          margin: "0 auto",
          padding: "0 16px",
          display: "flex",
          alignItems: "flex-end",
          gap: 14,
          marginTop: -36,
          position: "relative",
          zIndex: 2,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 18,
            background: "var(--bg-elevated)",
            border: "3px solid var(--bg-base)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 36,
            flexShrink: 0,
            boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
          }}
        >
          {biz.icon_emoji ?? "🍴"}
        </div>
        <div style={{ paddingBottom: 4, minWidth: 0 }}>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: "0 0 4px",
              lineHeight: 1.2,
            }}
          >
            {biz.name}
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ color: "var(--color-gold)", fontSize: 13 }}>★</span>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              {biz.category ?? "Restaurante"}
            </span>
          </div>
        </div>
      </div>

      {biz.description && (
        <div
          style={{
            maxWidth: 680,
            margin: "0 auto",
            padding: "0 16px 12px",
          }}
        >
          <p
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            {biz.description}
          </p>
        </div>
      )}
    </div>
  );
}

function CategoryNav({
  categories,
  activeId,
  onSelect,
}: {
  categories: PublicMenuCategory[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll active chip into view when activeId changes
  useEffect(() => {
    const el = scrollRef.current?.querySelector<HTMLButtonElement>(
      `[data-cat="${activeId}"]`
    );
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeId]);

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: "var(--bg-base)",
        borderBottom: "1px solid var(--border-subtle)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
      }}
    >
      <div
        ref={scrollRef}
        style={{
          display: "flex",
          gap: 8,
          overflowX: "auto",
          padding: "10px 16px",
          scrollbarWidth: "none",
          maxWidth: 680,
          margin: "0 auto",
        }}
      >
        {categories.map((cat) => {
          const active = cat.id === activeId;
          return (
            <button
              key={cat.id}
              data-cat={cat.id}
              onClick={() => onSelect(cat.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "6px 14px",
                borderRadius: 20,
                border: active
                  ? "1px solid var(--color-gold)"
                  : "1px solid var(--border-subtle)",
                background: active
                  ? "rgba(217,119,6,0.15)"
                  : "var(--bg-surface)",
                color: active ? "var(--color-gold)" : "var(--text-secondary)",
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
                transition: "all 0.15s",
              }}
            >
              {cat.icon && <span>{cat.icon}</span>}
              {cat.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ItemPhoto({
  item,
  size = 180,
}: {
  item: PublicMenuItem;
  size?: number;
}) {
  const primaryUrl = item.photos[0]?.url ?? item.photo_url;
  const extraCount = item.photos.length > 1 ? item.photos.length - 1 : 0;

  if (!primaryUrl) {
    return (
      <div
        style={{
          width: "100%",
          height: size,
          background:
            "linear-gradient(135deg, var(--bg-elevated) 0%, var(--bg-surface) 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 36,
          flexShrink: 0,
        }}
      >
        🍽️
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", height: size, flexShrink: 0 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={primaryUrl}
        alt=""
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
        }}
      />
      {extraCount > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: 8,
            right: 8,
            background: "rgba(0,0,0,0.65)",
            color: "#fff",
            fontSize: 11,
            fontWeight: 600,
            borderRadius: 10,
            padding: "2px 7px",
          }}
        >
          +{extraCount}
        </div>
      )}
    </div>
  );
}

function ItemCard({
  item,
  onTap,
}: {
  item: PublicMenuItem;
  onTap: (item: PublicMenuItem) => void;
}) {
  const soldOut = item.stock_count !== null && item.stock_count === 0;
  const hasSizes = (item.options.sizes?.length ?? 0) > 0;
  const hasExtras = (item.options.extras?.length ?? 0) > 0;
  const hasOptions = hasSizes || hasExtras;
  const badge = item.badge ? BADGE_CONFIG[item.badge] : null;

  return (
    <div
      onClick={() => !soldOut && onTap(item)}
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 14,
        overflow: "hidden",
        cursor: soldOut ? "not-allowed" : "pointer",
        opacity: soldOut ? 0.65 : 1,
        transition: "transform 0.1s, box-shadow 0.1s",
        position: "relative",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Photo area */}
      <div style={{ position: "relative" }}>
        <ItemPhoto item={item} size={160} />

        {/* Badge overlay on photo */}
        {badge && (
          <div
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              background: badge.bg,
              color: badge.color,
              fontSize: 10,
              fontWeight: 700,
              borderRadius: 8,
              padding: "3px 7px",
            }}
          >
            {badge.label}
          </div>
        )}

        {/* Sold-out overlay */}
        {soldOut && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                background: "var(--color-danger)",
                color: "#fff",
                fontSize: 11,
                fontWeight: 700,
                borderRadius: 8,
                padding: "4px 10px",
              }}
            >
              Agotado
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: "10px 12px 12px", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-primary)",
            lineHeight: 1.3,
          }}
        >
          {item.name}
        </div>

        {item.description && (
          <div
            style={{
              fontSize: 11,
              color: "var(--text-tertiary)",
              lineHeight: 1.4,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {item.description}
          </div>
        )}

        {/* Dietary tags */}
        {item.dietary_tags.length > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {item.dietary_tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: 9,
                  color: "var(--text-tertiary)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 6,
                  padding: "1px 5px",
                }}
              >
                {DIETARY_LABELS[tag] ?? tag}
              </span>
            ))}
          </div>
        )}

        {/* Price row */}
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 4,
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--color-gold)",
            }}
          >
            {fmtPrice(item.price_cents)}
          </span>
          {!soldOut && (
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "var(--color-brand)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
                color: "#fff",
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {hasOptions ? "⚙" : "+"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CategorySection({
  category,
  sectionRef,
  onItemTap,
}: {
  category: PublicMenuCategory;
  sectionRef: (el: HTMLElement | null) => void;
  onItemTap: (item: PublicMenuItem) => void;
}) {
  if (category.items.length === 0) return null;

  return (
    <section
      id={`cat-${category.id}`}
      ref={sectionRef}
      style={{ scrollMarginTop: 56 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "20px 16px 12px",
          maxWidth: 680,
          margin: "0 auto",
        }}
      >
        {category.icon && (
          <span style={{ fontSize: 20 }}>{category.icon}</span>
        )}
        <h2
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "var(--text-primary)",
            margin: 0,
          }}
        >
          {category.name}
        </h2>
        <span
          style={{
            fontSize: 11,
            color: "var(--text-tertiary)",
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 10,
            padding: "1px 7px",
          }}
        >
          {category.items.length}
        </span>
      </div>

      <div
        style={{
          maxWidth: 680,
          margin: "0 auto",
          padding: "0 16px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: 12,
        }}
      >
        {category.items.map((item) => (
          <ItemCard key={item.id} item={item} onTap={onItemTap} />
        ))}
      </div>
    </section>
  );
}

// ── Customizer Sheet ──────────────────────────────────────────────────────────

function CustomizerSheet({
  item,
  onClose,
  onAddToCart,
}: {
  item: PublicMenuItem;
  onClose: () => void;
  onAddToCart: (
    item: PublicMenuItem,
    size: MenuItemOption | null,
    extras: MenuItemOption[],
    qty: number
  ) => void;
}) {
  const hasSizes = (item.options.sizes?.length ?? 0) > 0;
  const hasExtras = (item.options.extras?.length ?? 0) > 0;

  const [selectedSize, setSelectedSize] = useState<MenuItemOption | null>(
    hasSizes ? null : null
  );
  const [selectedExtras, setSelectedExtras] = useState<Set<string>>(new Set());
  const [qty, setQty] = useState(1);

  const toggleExtra = useCallback((extra: MenuItemOption) => {
    setSelectedExtras((prev) => {
      const next = new Set(prev);
      if (next.has(extra.label)) next.delete(extra.label);
      else next.add(extra.label);
      return next;
    });
  }, []);

  const extrasArr: MenuItemOption[] = (item.options.extras ?? []).filter((e) =>
    selectedExtras.has(e.label)
  );
  const totalCents = calcLine(
    item.price_cents,
    selectedSize,
    extrasArr,
    qty
  );

  const canAdd = !hasSizes || selectedSize !== null;

  const primaryUrl = item.photos[0]?.url ?? item.photo_url;

  return (
    <Backdrop onClose={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-elevated)",
          borderRadius: "20px 20px 0 0",
          overflow: "hidden",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header photo */}
        <div style={{ position: "relative", height: 200, flexShrink: 0 }}>
          {primaryUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={primaryUrl}
              alt={item.name}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                background:
                  "linear-gradient(135deg, var(--color-brand) 0%, var(--color-brand-purple) 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 48,
              }}
            >
              🍽️
            </div>
          )}
          {/* close button */}
          <button
            onClick={onClose}
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "rgba(0,0,0,0.5)",
              border: "none",
              color: "#fff",
              fontSize: 16,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
          {/* multi-photo indicator */}
          {item.photos.length > 1 && (
            <div
              style={{
                position: "absolute",
                bottom: 10,
                right: 12,
                background: "rgba(0,0,0,0.6)",
                color: "#fff",
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 10,
                padding: "2px 8px",
              }}
            >
              1 / {item.photos.length}
            </div>
          )}
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: "auto", flex: 1, padding: "16px 16px 0" }}>
          {/* Name + price */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 4,
            }}
          >
            <h3
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "var(--text-primary)",
                margin: 0,
                flex: 1,
                paddingRight: 12,
              }}
            >
              {item.name}
            </h3>
            <span
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: "var(--color-gold)",
                flexShrink: 0,
              }}
            >
              {fmtPrice(item.price_cents)}
            </span>
          </div>
          {item.description && (
            <p
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                lineHeight: 1.6,
                margin: "0 0 16px",
              }}
            >
              {item.description}
            </p>
          )}

          {/* Sizes */}
          {hasSizes && (
            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  marginBottom: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                Tamaño{" "}
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--color-danger)",
                    background: "rgba(220,38,38,0.1)",
                    padding: "1px 6px",
                    borderRadius: 6,
                  }}
                >
                  requerido
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(item.options.sizes ?? []).map((size) => {
                  const active = selectedSize?.label === size.label;
                  return (
                    <button
                      key={size.label}
                      onClick={() => setSelectedSize(size)}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "10px 14px",
                        borderRadius: 12,
                        border: active
                          ? "2px solid var(--color-brand)"
                          : "1px solid var(--border-subtle)",
                        background: active
                          ? "rgba(79,70,229,0.1)"
                          : "var(--bg-surface)",
                        cursor: "pointer",
                        width: "100%",
                        textAlign: "left",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 14,
                          color: active
                            ? "var(--color-brand)"
                            : "var(--text-primary)",
                          fontWeight: active ? 600 : 400,
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <span
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: "50%",
                            border: active
                              ? "5px solid var(--color-brand)"
                              : "2px solid var(--border-subtle)",
                            flexShrink: 0,
                          }}
                        />
                        {size.label}
                      </span>
                      {size.price_cents > 0 && (
                        <span
                          style={{
                            fontSize: 13,
                            color: "var(--text-secondary)",
                            fontWeight: 500,
                          }}
                        >
                          +{fmtPrice(size.price_cents)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Extras */}
          {hasExtras && (
            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  marginBottom: 8,
                }}
              >
                Extras{" "}
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                  (opcional)
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(item.options.extras ?? []).map((extra) => {
                  const checked = selectedExtras.has(extra.label);
                  return (
                    <button
                      key={extra.label}
                      onClick={() => toggleExtra(extra)}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "10px 14px",
                        borderRadius: 12,
                        border: checked
                          ? "2px solid var(--color-brand)"
                          : "1px solid var(--border-subtle)",
                        background: checked
                          ? "rgba(79,70,229,0.1)"
                          : "var(--bg-surface)",
                        cursor: "pointer",
                        width: "100%",
                        textAlign: "left",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 14,
                          color: checked
                            ? "var(--color-brand)"
                            : "var(--text-primary)",
                          fontWeight: checked ? 600 : 400,
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <span
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: 4,
                            border: checked
                              ? "5px solid var(--color-brand)"
                              : "2px solid var(--border-subtle)",
                            flexShrink: 0,
                          }}
                        />
                        {extra.label}
                      </span>
                      {extra.price_cents > 0 && (
                        <span
                          style={{
                            fontSize: 13,
                            color: "var(--text-secondary)",
                            fontWeight: 500,
                          }}
                        >
                          +{fmtPrice(extra.price_cents)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Qty */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 20,
              padding: "12px 0 20px",
            }}
          >
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              style={qtyBtnStyle}
            >
              −
            </button>
            <span
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "var(--text-primary)",
                minWidth: 32,
                textAlign: "center",
              }}
            >
              {qty}
            </span>
            <button
              onClick={() => setQty((q) => q + 1)}
              style={qtyBtnStyle}
            >
              +
            </button>
          </div>
        </div>

        {/* Sticky CTA */}
        <div
          style={{
            padding: "12px 16px 24px",
            background: "var(--bg-elevated)",
            borderTop: "1px solid var(--border-subtle)",
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => {
              if (!canAdd) return;
              onAddToCart(item, selectedSize, extrasArr, qty);
            }}
            disabled={!canAdd}
            style={{
              width: "100%",
              padding: "14px 20px",
              borderRadius: 14,
              border: "none",
              background: canAdd
                ? "linear-gradient(135deg, var(--color-brand) 0%, var(--color-brand-purple) 100%)"
                : "var(--bg-surface)",
              color: canAdd ? "#fff" : "var(--text-tertiary)",
              fontSize: 15,
              fontWeight: 700,
              cursor: canAdd ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>Agregar al carrito</span>
            <span>{fmtPrice(totalCents)}</span>
          </button>
          {hasSizes && !selectedSize && (
            <p
              style={{
                fontSize: 11,
                color: "var(--color-danger)",
                textAlign: "center",
                margin: "8px 0 0",
              }}
            >
              Selecciona un tamaño para continuar
            </p>
          )}
        </div>
      </div>
    </Backdrop>
  );
}

// ── Cart Sheet ────────────────────────────────────────────────────────────────

function CartSheet({
  cartItems,
  onClose,
  onUpdateQty,
  onRemove,
  onContinue,
}: {
  cartItems: CartItem[];
  onClose: () => void;
  onUpdateQty: (cartId: string, delta: number) => void;
  onRemove: (cartId: string) => void;
  onContinue: () => void;
}) {
  const subtotal = cartItems.reduce((s, i) => s + i.lineTotalCents, 0);

  return (
    <Backdrop onClose={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-elevated)",
          borderRadius: "20px 20px 0 0",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 16px 12px",
            borderBottom: "1px solid var(--border-subtle)",
            flexShrink: 0,
          }}
        >
          <h2
            style={{
              fontSize: 17,
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: 0,
            }}
          >
            🛒 Tu carrito
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-tertiary)",
              fontSize: 16,
              cursor: "pointer",
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* Items */}
        <div style={{ overflowY: "auto", flex: 1, padding: "12px 16px" }}>
          {cartItems.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "40px 0",
                color: "var(--text-tertiary)",
                fontSize: 14,
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 8 }}>🛒</div>
              Tu carrito está vacío
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {cartItems.map((ci) => (
                <div
                  key={ci.cartId}
                  style={{
                    background: "var(--bg-surface)",
                    borderRadius: 12,
                    padding: "12px 14px",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        flex: 1,
                        paddingRight: 8,
                      }}
                    >
                      {ci.name}
                    </span>
                    <button
                      onClick={() => onRemove(ci.cartId)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--color-danger)",
                        cursor: "pointer",
                        fontSize: 14,
                        padding: 0,
                        flexShrink: 0,
                      }}
                    >
                      ✕
                    </button>
                  </div>

                  {/* Options summary */}
                  {(ci.selectedSize || ci.selectedExtras.length > 0) && (
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-tertiary)",
                        marginBottom: 8,
                        lineHeight: 1.5,
                      }}
                    >
                      {ci.selectedSize && <span>{ci.selectedSize.label}</span>}
                      {ci.selectedSize && ci.selectedExtras.length > 0 && (
                        <span> · </span>
                      )}
                      {ci.selectedExtras.map((e, i) => (
                        <span key={e.label}>
                          {i > 0 && ", "}
                          {e.label}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Qty + line total */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <button
                        onClick={() => onUpdateQty(ci.cartId, -1)}
                        style={smallQtyBtnStyle}
                      >
                        −
                      </button>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: "var(--text-primary)",
                          minWidth: 20,
                          textAlign: "center",
                        }}
                      >
                        {ci.quantity}
                      </span>
                      <button
                        onClick={() => onUpdateQty(ci.cartId, 1)}
                        style={smallQtyBtnStyle}
                      >
                        +
                      </button>
                    </div>
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "var(--color-gold)",
                      }}
                    >
                      {fmtPrice(ci.lineTotalCents)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 16px 24px",
            borderTop: "1px solid var(--border-subtle)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 14,
            }}
          >
            <span
              style={{
                fontSize: 14,
                color: "var(--text-secondary)",
                fontWeight: 500,
              }}
            >
              Subtotal
            </span>
            <span
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "var(--text-primary)",
              }}
            >
              {fmtPrice(subtotal)}
            </span>
          </div>
          <button
            onClick={onContinue}
            disabled={cartItems.length === 0}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: 14,
              border: "none",
              background:
                cartItems.length > 0
                  ? "linear-gradient(135deg, var(--color-brand) 0%, var(--color-brand-purple) 100%)"
                  : "var(--bg-surface)",
              color: cartItems.length > 0 ? "#fff" : "var(--text-tertiary)",
              fontSize: 15,
              fontWeight: 700,
              cursor: cartItems.length > 0 ? "pointer" : "not-allowed",
            }}
          >
            Continuar
          </button>
        </div>
      </div>
    </Backdrop>
  );
}

// ── Pickup Sheet ──────────────────────────────────────────────────────────────

function PickupSheet({
  cartItems,
  onBack,
  onConfirm,
}: {
  cartItems: CartItem[];
  onBack: () => void;
  onConfirm: (type: PickupType, tableNumber: string) => void;
}) {
  const [pickupType, setPickupType] = useState<PickupType>("counter");
  const [tableNumber, setTableNumber] = useState("");
  const subtotal = cartItems.reduce((s, i) => s + i.lineTotalCents, 0);

  const canConfirm =
    pickupType === "counter" || tableNumber.trim().length > 0;

  return (
    <Backdrop onClose={onBack}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-elevated)",
          borderRadius: "20px 20px 0 0",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "16px 16px 12px",
            borderBottom: "1px solid var(--border-subtle)",
            flexShrink: 0,
          }}
        >
          <button
            onClick={onBack}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-secondary)",
              cursor: "pointer",
              fontSize: 20,
              padding: 0,
              lineHeight: 1,
            }}
          >
            ←
          </button>
          <h2
            style={{
              fontSize: 17,
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: 0,
            }}
          >
            ¿Cómo quieres recibir tu pedido?
          </h2>
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "16px" }}>
          {/* Pickup options */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            {(
              [
                { type: "counter" as PickupType, label: "🍽️ En la barra", desc: "Recoge en el counter cuando esté listo" },
                { type: "table" as PickupType, label: "🪑 En mi mesa", desc: "Te lo llevamos a tu mesa" },
              ] as const
            ).map(({ type, label, desc }) => {
              const active = pickupType === type;
              return (
                <button
                  key={type}
                  onClick={() => setPickupType(type)}
                  style={{
                    padding: "14px 16px",
                    borderRadius: 14,
                    border: active
                      ? "2px solid var(--color-brand)"
                      : "1px solid var(--border-subtle)",
                    background: active
                      ? "rgba(79,70,229,0.1)"
                      : "var(--bg-surface)",
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%",
                  }}
                >
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: active
                        ? "var(--color-brand)"
                        : "var(--text-primary)",
                      marginBottom: 3,
                    }}
                  >
                    {label}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-tertiary)",
                    }}
                  >
                    {desc}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Table number */}
          {pickupType === "table" && (
            <div style={{ marginBottom: 20 }}>
              <label
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  display: "block",
                  marginBottom: 8,
                }}
              >
                Número de mesa
              </label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="Ej: 12"
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid var(--border-subtle)",
                  background: "var(--bg-surface)",
                  color: "var(--text-primary)",
                  fontSize: 15,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
          )}

          {/* Order summary */}
          <div
            style={{
              background: "var(--bg-surface)",
              borderRadius: 14,
              padding: "14px 16px",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 10,
              }}
            >
              Resumen del pedido
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {cartItems.map((ci) => (
                <div
                  key={ci.cartId}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      color: "var(--text-secondary)",
                      flex: 1,
                    }}
                  >
                    {ci.quantity}× {ci.name}
                    {ci.selectedSize ? ` (${ci.selectedSize.label})` : ""}
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      flexShrink: 0,
                    }}
                  >
                    {fmtPrice(ci.lineTotalCents)}
                  </span>
                </div>
              ))}
            </div>
            <div
              style={{
                borderTop: "1px solid var(--border-subtle)",
                marginTop: 10,
                paddingTop: 10,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--text-primary)",
                }}
              >
                Total
              </span>
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: "var(--color-gold)",
                }}
              >
                {fmtPrice(subtotal)}
              </span>
            </div>
          </div>
        </div>

        {/* Confirm button */}
        <div
          style={{
            padding: "12px 16px 24px",
            borderTop: "1px solid var(--border-subtle)",
            flexShrink: 0,
          }}
        >
          <button
            onClick={() =>
              canConfirm && onConfirm(pickupType, tableNumber.trim())
            }
            disabled={!canConfirm}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: 14,
              border: "none",
              background: canConfirm
                ? "linear-gradient(135deg, #059669 0%, #0d9488 100%)"
                : "var(--bg-surface)",
              color: canConfirm ? "#fff" : "var(--text-tertiary)",
              fontSize: 15,
              fontWeight: 700,
              cursor: canConfirm ? "pointer" : "not-allowed",
            }}
          >
            Confirmar pedido (demo)
          </button>
          {pickupType === "table" && !tableNumber.trim() && (
            <p
              style={{
                fontSize: 11,
                color: "var(--color-danger)",
                textAlign: "center",
                margin: "8px 0 0",
              }}
            >
              Ingresa el número de mesa
            </p>
          )}
        </div>
      </div>
    </Backdrop>
  );
}

// ── Success Sheet ─────────────────────────────────────────────────────────────

function SuccessSheet({
  pickupType,
  tableNumber,
  onDone,
}: {
  pickupType: PickupType;
  tableNumber: string;
  onDone: () => void;
}) {
  return (
    <Backdrop onClose={onDone}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-elevated)",
          borderRadius: "20px 20px 0 0",
          padding: "32px 24px 40px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
        <h2
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "var(--text-primary)",
            margin: "0 0 10px",
          }}
        >
          ¡Pedido recibido!
        </h2>
        <p
          style={{
            fontSize: 14,
            color: "var(--text-secondary)",
            lineHeight: 1.6,
            margin: "0 0 8px",
          }}
        >
          {pickupType === "counter"
            ? "Recoge tu pedido en la barra cuando esté listo."
            : `Te lo llevamos a la mesa ${tableNumber}.`}
        </p>
        <p
          style={{
            fontSize: 12,
            color: "var(--text-tertiary)",
            margin: "0 0 28px",
          }}
        >
          Pago próximamente — esto es una demo del flujo.
        </p>
        <button
          onClick={onDone}
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: 14,
            border: "none",
            background:
              "linear-gradient(135deg, var(--color-brand) 0%, var(--color-brand-purple) 100%)",
            color: "#fff",
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Seguir viendo el menú
        </button>
      </div>
    </Backdrop>
  );
}

// ── Backdrop (shared overlay wrapper) ────────────────────────────────────────

function Backdrop({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  // Prevent body scroll while sheet is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
      }}
    >
      {children}
    </div>
  );
}

// ── Shared button styles ──────────────────────────────────────────────────────

const qtyBtnStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: "50%",
  border: "1px solid var(--border-subtle)",
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
  fontSize: 20,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 700,
  lineHeight: 1,
};

const smallQtyBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: "50%",
  border: "1px solid var(--border-subtle)",
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
  fontSize: 16,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 700,
  lineHeight: 1,
};

// ── Empty menu state ──────────────────────────────────────────────────────────

function EmptyMenu({ bizName }: { bizName: string }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "60px 24px",
        color: "var(--text-tertiary)",
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 12 }}>🍽️</div>
      <h2
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: "var(--text-secondary)",
          margin: "0 0 8px",
        }}
      >
        {bizName} aún no tiene menú
      </h2>
      <p style={{ fontSize: 13, margin: 0, lineHeight: 1.6 }}>
        Estamos preparando algo delicioso. Vuelve pronto.
      </p>
    </div>
  );
}

// ── Cart FAB ──────────────────────────────────────────────────────────────────

function CartFAB({
  count,
  total,
  onClick,
}: {
  count: number;
  total: number;
  onClick: () => void;
}) {
  if (count === 0) return null;

  return (
    <button
      onClick={onClick}
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 30,
        background:
          "linear-gradient(135deg, var(--color-brand) 0%, var(--color-brand-purple) 100%)",
        color: "#fff",
        border: "none",
        borderRadius: 24,
        padding: "14px 24px",
        fontSize: 15,
        fontWeight: 700,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 12,
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          background: "rgba(255,255,255,0.25)",
          borderRadius: 12,
          padding: "2px 8px",
          fontSize: 13,
        }}
      >
        {count}
      </span>
      Ver carrito · {fmtPrice(total)}
    </button>
  );
}

// ── Main MenuPageClient ───────────────────────────────────────────────────────

export default function MenuPageClient({
  business,
  categories,
}: {
  business: PublicBusiness;
  categories: PublicMenuCategory[];
}) {
  // ── Cart state ──────────────────────────────────────────────────────────────
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [customizerItem, setCustomizerItem] = useState<PublicMenuItem | null>(null);
  const [step, setStep] = useState<AppStep>("menu");
  const [pickupType, setPickupType] = useState<PickupType>("counter");
  const [pickupTable, setPickupTable] = useState("");

  // ── Category nav active tracking ────────────────────────────────────────────
  const [activeCategory, setActiveCategory] = useState<string>(
    categories[0]?.id ?? ""
  );
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());

  useEffect(() => {
    if (categories.length === 0) return;

    const observers: IntersectionObserver[] = [];
    const NAV_HEIGHT = 56;

    categories.forEach((cat) => {
      const el = sectionRefs.current.get(cat.id);
      if (!el) return;

      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveCategory(cat.id);
        },
        { rootMargin: `-${NAV_HEIGHT}px 0px -60% 0px`, threshold: 0 }
      );
      obs.observe(el);
      observers.push(obs);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, [categories]);

  const scrollToCategory = useCallback((catId: string) => {
    setActiveCategory(catId);
    document.getElementById(`cat-${catId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  // ── Cart handlers ───────────────────────────────────────────────────────────
  const addToCart = useCallback(
    (
      item: PublicMenuItem,
      size: MenuItemOption | null,
      extras: MenuItemOption[],
      qty: number
    ) => {
      const lineTotalCents = calcLine(item.price_cents, size, extras, qty);
      setCartItems((prev) => [
        ...prev,
        {
          cartId: `${item.id}-${Date.now()}`,
          itemId: item.id,
          name: item.name,
          basePriceCents: item.price_cents,
          quantity: qty,
          selectedSize: size,
          selectedExtras: extras,
          lineTotalCents,
        },
      ]);
      setCustomizerItem(null);
    },
    []
  );

  const updateQty = useCallback((cartId: string, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((ci) => {
          if (ci.cartId !== cartId) return ci;
          const newQty = ci.quantity + delta;
          if (newQty <= 0) return null;
          return {
            ...ci,
            quantity: newQty,
            lineTotalCents: calcLine(
              ci.basePriceCents,
              ci.selectedSize,
              ci.selectedExtras,
              newQty
            ),
          };
        })
        .filter(Boolean) as CartItem[]
    );
  }, []);

  const removeFromCart = useCallback((cartId: string) => {
    setCartItems((prev) => prev.filter((ci) => ci.cartId !== cartId));
  }, []);

  // ── Item tap handler ────────────────────────────────────────────────────────
  const handleItemTap = useCallback((item: PublicMenuItem) => {
    const hasSizes = (item.options.sizes?.length ?? 0) > 0;
    const hasExtras = (item.options.extras?.length ?? 0) > 0;
    if (hasSizes || hasExtras) {
      setCustomizerItem(item);
    } else {
      // No options: add directly with qty=1
      addToCart(item, null, [], 1);
    }
  }, [addToCart]);

  const cartCount = cartItems.reduce((s, i) => s + i.quantity, 0);
  const cartTotal = cartItems.reduce((s, i) => s + i.lineTotalCents, 0);

  return (
    <main
      data-theme="dark"
      style={{
        background: "var(--bg-base)",
        minHeight: "100vh",
        color: "var(--text-primary)",
        paddingBottom: cartCount > 0 ? 96 : 32,
      }}
    >
      {/* Business header */}
      <BusinessHeader biz={business} />

      {/* Category nav — only if there are categories */}
      {categories.length > 0 && (
        <CategoryNav
          categories={categories}
          activeId={activeCategory}
          onSelect={scrollToCategory}
        />
      )}

      {/* Menu content */}
      {categories.length === 0 ? (
        <EmptyMenu bizName={business.name} />
      ) : (
        <div style={{ paddingBottom: 24 }}>
          {categories.map((cat) => (
            <CategorySection
              key={cat.id}
              category={cat}
              sectionRef={(el) => {
                if (el) sectionRefs.current.set(cat.id, el);
                else sectionRefs.current.delete(cat.id);
              }}
              onItemTap={handleItemTap}
            />
          ))}
        </div>
      )}

      {/* Floating cart button */}
      <CartFAB
        count={cartCount}
        total={cartTotal}
        onClick={() => setStep("cart")}
      />

      {/* Customizer */}
      {customizerItem && (
        <CustomizerSheet
          item={customizerItem}
          onClose={() => setCustomizerItem(null)}
          onAddToCart={addToCart}
        />
      )}

      {/* Cart sheet */}
      {step === "cart" && (
        <CartSheet
          cartItems={cartItems}
          onClose={() => setStep("menu")}
          onUpdateQty={updateQty}
          onRemove={removeFromCart}
          onContinue={() => setStep("pickup")}
        />
      )}

      {/* Pickup step */}
      {step === "pickup" && (
        <PickupSheet
          cartItems={cartItems}
          onBack={() => setStep("cart")}
          onConfirm={(type, table) => {
            setPickupType(type);
            setPickupTable(table);
            setStep("success");
          }}
        />
      )}

      {/* Success */}
      {step === "success" && (
        <SuccessSheet
          pickupType={pickupType}
          tableNumber={pickupTable}
          onDone={() => {
            setCartItems([]);
            setStep("menu");
          }}
        />
      )}
    </main>
  );
}
