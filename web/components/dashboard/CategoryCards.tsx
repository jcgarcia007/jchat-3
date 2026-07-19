"use client";

/**
 * Category cards — a horizontal, touch-friendly row of category chips with an
 * icon, the PUBLISHED item count, and honest warning pills (out-of-stock,
 * hidden, untranslated). Reused by the dashboard menu manager and the waiter
 * terminal (docs/TERMINAL_MESERO.md), so it stays pointer-agnostic (overflow-x
 * scroll, big tap targets) and purely presentational. Tokens: --db-* only.
 *
 * Reordering lives elsewhere (the menu manager's up/down buttons) — these cards
 * are a selector, not a sort control.
 */

import { IconLayoutGrid } from "@tabler/icons-react";
import { getCategoryIcon, CategoryFallbackIcon } from "@/lib/categoryIcons";

export interface CategoryCard {
  id: string;
  name: string;
  iconUrl: string | null;
  icon: string | null;
  /** Items the customer can see (is_published = true). */
  publishedCount: number;
  /** Of the published items, how many can't be sold now. */
  outOfStock: number;
  /** Category itself is is_published = false (owner sees it; customer doesn't). */
  hidden: boolean;
  /** name_alt is null/empty → missing its second-language name. */
  untranslated: boolean;
}

export function CategoryCards({
  cards,
  totalPublished,
  activeId,
  onSelect,
  loading = false,
  loadError = false,
  onRetry,
}: {
  cards: CategoryCard[];
  totalPublished: number;
  activeId: string | null; // null = "Todas"
  onSelect: (id: string | null) => void;
  loading?: boolean;
  loadError?: boolean;
  onRetry?: () => void;
}) {
  if (loading) {
    return <div style={noticeStyle}>Cargando categorías…</div>;
  }
  if (loadError) {
    return (
      <div style={{ ...noticeStyle, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ color: "var(--db-danger)" }}>
          No se pudieron cargar las categorías. Revisa tu conexión e inténtalo de nuevo.
        </span>
        {onRetry && (
          <button type="button" onClick={onRetry} style={retryStyle}>
            Reintentar
          </button>
        )}
      </div>
    );
  }
  if (cards.length === 0) {
    return <div style={noticeStyle}>Aún no has creado categorías.</div>;
  }

  return (
    <div
      role="tablist"
      aria-label="Categorías"
      style={{
        display: "flex",
        gap: 10,
        overflowX: "auto",
        padding: "4px 2px 10px",
        scrollbarWidth: "thin",
      }}
    >
      {/* "Todas" */}
      <Card
        active={activeId === null}
        onClick={() => onSelect(null)}
        icon={<IconLayoutGrid size={20} stroke={1.6} />}
        name="Todas"
        countLabel={`${totalPublished} ${totalPublished === 1 ? "plato" : "platos"}`}
      />

      {cards.map((c) => (
        <Card
          key={c.id}
          active={activeId === c.id}
          dim={c.hidden}
          onClick={() => onSelect(c.id)}
          icon={<CategoryIcon iconUrl={c.iconUrl} icon={c.icon} active={activeId === c.id} />}
          name={c.name}
          countLabel={c.publishedCount === 0 ? "Sin platos" : `${c.publishedCount} ${c.publishedCount === 1 ? "plato" : "platos"}`}
          countWarn={c.publishedCount === 0}
          badges={
            <>
              {c.outOfStock > 0 && <Pill tone="warn">{c.outOfStock} agotado{c.outOfStock !== 1 ? "s" : ""}</Pill>}
              {c.hidden && <Pill>Oculta</Pill>}
              {c.untranslated && <Pill>Sin traducir</Pill>}
            </>
          }
        />
      ))}
    </div>
  );
}

function Card({
  active,
  dim = false,
  onClick,
  icon,
  name,
  countLabel,
  countWarn = false,
  badges,
}: {
  active: boolean;
  dim?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  name: string;
  countLabel: string;
  countWarn?: boolean;
  badges?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        flex: "0 0 auto",
        minWidth: 128,
        maxWidth: 200,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "12px 14px",
        borderRadius: 14,
        border: active ? "1px solid var(--db-accent)" : "1px solid var(--db-border)",
        background: active ? "var(--db-accent)" : "var(--db-bg-surface)",
        color: active ? "var(--db-accent-text)" : "var(--db-text-primary)",
        cursor: "pointer",
        textAlign: "left",
        opacity: dim ? 0.6 : 1,
        transition: "background 0.15s, border-color 0.15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ display: "inline-flex", flexShrink: 0, color: active ? "var(--db-accent-text)" : "var(--db-accent)" }}>
          {icon}
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </span>
      </div>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: active
            ? "var(--db-accent-text)"
            : countWarn
              ? "var(--db-warning)"
              : "var(--db-text-tertiary)",
        }}
      >
        {countLabel}
      </span>
      {badges && <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{badges}</div>}
    </button>
  );
}

function CategoryIcon({ iconUrl, icon, active }: { iconUrl: string | null; icon: string | null; active: boolean }) {
  if (iconUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={iconUrl}
        alt=""
        style={{ width: 20, height: 20, borderRadius: "50%", objectFit: "cover", border: "1px solid var(--db-border)" }}
      />
    );
  }
  const TablerIcon = getCategoryIcon(icon);
  if (TablerIcon) return <TablerIcon size={20} stroke={1.6} />;
  if (icon) return <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>;
  return <CategoryFallbackIcon size={20} stroke={1.6} color={active ? "var(--db-accent-text)" : "var(--db-text-tertiary)"} />;
}

function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "warn" }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: "1px 7px",
        borderRadius: 999,
        background: "var(--db-bg-overlay)",
        color: tone === "warn" ? "var(--db-warning)" : "var(--db-text-tertiary)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

const noticeStyle: React.CSSProperties = {
  padding: "16px",
  fontSize: 14,
  color: "var(--db-text-secondary)",
  background: "var(--db-bg-surface)",
  border: "1px solid var(--db-border)",
  borderRadius: 12,
};

const retryStyle: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid var(--db-border)",
  background: "var(--db-bg-base)",
  color: "var(--db-text-primary)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
