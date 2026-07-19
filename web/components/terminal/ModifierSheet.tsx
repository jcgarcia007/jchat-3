"use client";

/**
 * Modifier picker — shared by the terminal's two writers of order lines:
 * TakeOrderScreen (adding a dish) and TableDetailSheet (editing one on an order
 * the kitchen hasn't started). Extracted from TakeOrderScreen so both go through
 * the same min/max rules and the same @/lib/orderOptions builder — a second
 * picker would eventually disagree about what a selection means, and the server
 * prices whatever shape it receives.
 *
 * The customer menu enforces the same rules: single groups pre-select, multi
 * groups cap at max_select, and a group with min_select > 0 blocks confirming.
 *
 * Tokens: --db-* only.
 */

import { useState } from "react";
import { IconX } from "@tabler/icons-react";
import { buildOrderOptions, type OrderLineOptions } from "@/lib/orderOptions";

export interface ModChoice {
  label: string;
  price_cents: number;
}
export interface ModGroup {
  id: string;
  label: string;
  type: "single" | "multi";
  min_select: number;
  max_select: number;
  choices: ModChoice[];
}
/** Minimum a dish needs to be configured. */
export interface ModDish {
  name: string;
  price_cents: number;
  groups: ModGroup[];
}

const money = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" });
const fmt = (c: number) => money.format(c / 100);

export function ModifierSheet({
  dish,
  initialLabels,
  confirmVerb = "Añadir",
  onCancel,
  onConfirm,
}: {
  dish: ModDish;
  /**
   * Labels already chosen on an EXISTING line, so editing starts from what the
   * dish actually is instead of silently resetting to defaults. order_items.options
   * stores VERIFIED LABELS (not {g,c}), so each label is matched back to the group
   * that contains it. A label whose group no longer offers it is dropped — the menu
   * changed, and we'd rather lose a stale choice than fabricate one.
   */
  initialLabels?: string[];
  confirmVerb?: string;
  onCancel: () => void;
  onConfirm: (options: OrderLineOptions, unitCents: number) => void;
}) {
  const preset = initialLabels ?? null;

  const [single, setSingle] = useState<Record<string, ModChoice | null>>(() => {
    const init: Record<string, ModChoice | null> = {};
    for (const g of dish.groups) {
      if (g.type !== "single" || g.choices.length === 0) continue;
      const fromPreset = preset ? g.choices.find((c) => preset.includes(c.label)) : undefined;
      // Editing: keep what the line already had. Adding: the first choice.
      init[g.id] = fromPreset ?? (preset ? null : g.choices[0]);
    }
    return init;
  });

  const [multi, setMulti] = useState<Record<string, Set<string>>>(() => {
    const init: Record<string, Set<string>> = {};
    if (!preset) return init;
    for (const g of dish.groups) {
      if (g.type !== "multi") continue;
      const chosen = g.choices.filter((c) => preset.includes(c.label)).map((c) => c.label);
      if (chosen.length > 0) init[g.id] = new Set(chosen);
    }
    return init;
  });

  function toggle(g: ModGroup, c: ModChoice) {
    setMulti((prev) => {
      const cur = new Set(prev[g.id] ?? []);
      if (cur.has(c.label)) cur.delete(c.label);
      else if (cur.size < g.max_select) cur.add(c.label);
      return { ...prev, [g.id]: cur };
    });
  }

  const groupSelections = dish.groups
    .map((g) => {
      if (g.type === "single") {
        const c = single[g.id] ?? null;
        return c ? { groupId: g.id, choices: [c] } : null;
      }
      const sel = multi[g.id] ?? new Set<string>();
      const chosen = g.choices.filter((c) => sel.has(c.label));
      return chosen.length > 0 ? { groupId: g.id, choices: chosen } : null;
    })
    .filter((g): g is { groupId: string; choices: ModChoice[] } => g !== null);

  // Estimate only — the server re-prices from the DB.
  const unitCents =
    dish.price_cents +
    groupSelections.reduce(
      (s, gs) => s + gs.choices.reduce((t, c) => t + (c.price_cents ?? 0), 0),
      0,
    );

  // min_select respected: a required group with nothing chosen blocks confirming.
  const unmet = dish.groups.filter((g) => {
    const chosen = groupSelections.find((gs) => gs.groupId === g.id)?.choices.length ?? 0;
    return chosen < (g.min_select ?? 0);
  });

  return (
    <div style={sheetOverlay} role="dialog" aria-label={`Opciones de ${dish.name}`}>
      <div style={sheetPanel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>{dish.name}</div>
          <button type="button" onClick={onCancel} aria-label="Cancelar" style={closeBtn}>
            <IconX size={20} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
          {dish.groups.map((g) => (
            <div key={g.id}>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>
                {g.label}
                <span style={{ fontWeight: 600, color: "var(--db-text-tertiary)", marginLeft: 6 }}>
                  {g.type === "single"
                    ? g.min_select > 0 ? "· obligatorio" : "· elige uno"
                    : `· hasta ${g.max_select}`}
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {g.choices.map((c) => {
                  const on =
                    g.type === "single"
                      ? single[g.id]?.label === c.label
                      : (multi[g.id] ?? new Set()).has(c.label);
                  return (
                    <button
                      key={c.label}
                      type="button"
                      onClick={() =>
                        g.type === "single"
                          ? setSingle((p) => ({ ...p, [g.id]: c }))
                          : toggle(g, c)
                      }
                      aria-pressed={on}
                      style={{
                        minHeight: 44,
                        padding: "10px 14px",
                        borderRadius: 12,
                        fontSize: 14,
                        fontWeight: 700,
                        border: on ? "2px solid var(--db-accent)" : "1px solid var(--db-border)",
                        background: on ? "var(--db-accent)" : "var(--db-bg-base)",
                        color: on ? "var(--db-accent-text)" : "var(--db-text-primary)",
                        cursor: "pointer",
                      }}
                    >
                      {c.label}
                      {c.price_cents > 0 && (
                        <span style={{ marginLeft: 6, opacity: 0.85 }}>+{fmt(c.price_cents)}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          disabled={unmet.length > 0}
          onClick={() => onConfirm(buildOrderOptions({ groupSelections }), unitCents)}
          style={{ ...primaryBtn, width: "100%", marginTop: 14, opacity: unmet.length > 0 ? 0.55 : 1 }}
        >
          {unmet.length > 0 ? `Elige: ${unmet[0].label}` : `${confirmVerb} · ${fmt(unitCents)}`}
        </button>
      </div>
    </div>
  );
}

const sheetOverlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 80,
  display: "flex", alignItems: "flex-end", justifyContent: "center",
};
const sheetPanel: React.CSSProperties = {
  background: "var(--db-bg-surface)", borderTop: "1px solid var(--db-border)",
  borderRadius: "18px 18px 0 0", padding: "18px 20px calc(18px + env(safe-area-inset-bottom))",
  width: "100%", maxWidth: 620, maxHeight: "85vh", display: "flex", flexDirection: "column",
};
const closeBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 44, height: 44, borderRadius: 12, border: "1px solid var(--db-border)",
  background: "var(--db-bg-surface)", color: "var(--db-text-primary)", cursor: "pointer", flexShrink: 0,
};
const primaryBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
  minHeight: 56, padding: "14px 20px", borderRadius: 14,
  background: "var(--db-accent)", color: "var(--db-accent-text)",
  border: "none", fontSize: 16, fontWeight: 800, cursor: "pointer",
};
