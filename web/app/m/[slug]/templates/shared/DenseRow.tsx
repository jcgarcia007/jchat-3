"use client";

import { useState, useCallback, useRef } from "react";
import { fmtPrice } from "./format";
import { BADGE_CONFIG, DIETARY_LABELS } from "./CategorySection";
import type { PublicMenuItem } from "../../page";

/**
 * A dense horizontal item row (thumbnail + info + add), the item archetype for
 * list-based templates like #02 Left Drawer. Ported from the Menu Systems Board
 * #02 mock but themed with the public-menu design tokens (--color-* and --bg-*),
 * not the mock's cream palette.
 */
export function DenseRow({
  item,
  onItemAdd,
}: {
  item: PublicMenuItem;
  onItemAdd: (item: PublicMenuItem) => void;
}) {
  const soldOut = item.stock_count !== null && item.stock_count === 0;
  const hasOptions = item.groups.length > 0;
  const badge = item.badge ? BADGE_CONFIG[item.badge] : null;

  const [faved, setFaved] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleAdd = useCallback(() => {
    if (soldOut) return;
    onItemAdd(item);
    if (!hasOptions) {
      setJustAdded(true);
      if (addedTimer.current) clearTimeout(addedTimer.current);
      addedTimer.current = setTimeout(() => setJustAdded(false), 1100);
    }
  }, [soldOut, hasOptions, item, onItemAdd]);

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        background: "var(--bg-surface)",
        border: "0.5px solid var(--border-subtle)",
        borderRadius: 14,
        padding: 10,
        opacity: soldOut ? 0.55 : 1,
      }}
    >
      {/* Thumbnail */}
      {item.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.photo_url}
          alt={item.name}
          style={{
            width: 62,
            height: 62,
            borderRadius: 10,
            objectFit: "cover",
            flexShrink: 0,
          }}
        />
      ) : (
        <div
          style={{
            width: 62,
            height: 62,
            borderRadius: 10,
            flexShrink: 0,
            background: "var(--bg-elevated)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 24,
          }}
        >
          🍽️
        </div>
      )}

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 13.5,
              fontWeight: 700,
              color: "var(--text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {item.name}
          </span>
          {badge && (
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 800,
                padding: "1px 6px",
                borderRadius: 999,
                background: badge.bg,
                color: badge.color,
                flexShrink: 0,
              }}
            >
              {badge.label}
            </span>
          )}
        </div>

        {item.description && (
          <div
            style={{
              fontSize: 11,
              color: "var(--text-tertiary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              marginTop: 2,
            }}
          >
            {item.description}
          </div>
        )}

        {item.dietary_tags.length > 0 && (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 4 }}>
            {item.dietary_tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: 9.5,
                  color: "var(--text-secondary)",
                  background: "var(--bg-elevated)",
                  border: "0.5px solid var(--border-subtle)",
                  borderRadius: 6,
                  padding: "1px 6px",
                }}
              >
                {DIETARY_LABELS[tag] ?? tag}
              </span>
            ))}
          </div>
        )}

        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--color-gold)", marginTop: 3 }}>
          {soldOut ? "Agotado" : fmtPrice(item.price_cents)}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => setFaved((v) => !v)}
          aria-label={faved ? "Quitar de favoritos" : "Agregar a favoritos"}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 15,
            lineHeight: 1,
            padding: 0,
            color: faved ? "var(--color-brand)" : "var(--text-tertiary)",
          }}
        >
          {faved ? "♥" : "♡"}
        </button>
        <button
          type="button"
          onClick={handleAdd}
          disabled={soldOut}
          aria-label={hasOptions ? "Personalizar" : "Agregar al carrito"}
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            background: soldOut ? "var(--bg-elevated)" : justAdded ? "#059669" : "var(--color-brand)",
            color: "#fff",
            border: "none",
            fontSize: 17,
            fontWeight: 700,
            cursor: soldOut ? "not-allowed" : "pointer",
            lineHeight: 1,
            padding: 0,
            flexShrink: 0,
            transform: justAdded ? "scale(1.1)" : "scale(1)",
            transition: "transform .18s cubic-bezier(.22,1,.36,1), background .2s ease",
          }}
        >
          {soldOut ? "×" : hasOptions ? "⚙" : justAdded ? "✓" : "+"}
        </button>
      </div>
    </div>
  );
}
