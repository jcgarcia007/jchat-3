/**
 * JChat 3.0 — PosDraftContext (C7)
 *
 * Lightweight React context that holds per-table draft orders before they are
 * sent to the kitchen.  Lives inside PosNavigator (above PosHome / PosTableHub
 * / PosOrder) so it persists as the employee moves between seats.
 *
 * State shape:  Record<tableId, DraftItem[]>
 *   • Items for different seats are distinguished by DraftItem.seat.
 *   • null seat = "whole-table" order (center tap in the diagram).
 *
 * Typical lifecycle:
 *   1. PosTableHub taps seat N  →  navigate PosOrder(seat: N)
 *   2. Employee builds cart in PosOrder
 *   3. Taps "Listo · Agregar"  →  setSeatDraft(tableId, N, items)  →  goBack()
 *   4. PosTableHub shows draft in summary; "Enviar a cocina" button activates
 *   5. Tap "Enviar a cocina"  →  posCreateOrder(…)  →  clearTableDraft(tableId)
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useState,
} from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

/** One modifier group selection — mirrors PosModifierSelection in PosOrderScreen. */
export interface DraftModifier {
  group_id: string;
  group_label: string;
  choice_labels: string[];
}

/**
 * One line in the per-seat local draft.
 * Mirrors CartItem from PosOrderScreen, plus seat + note fields.
 */
export interface DraftItem {
  /** Deterministic key — same algorithm as CartItem.cartKey in PosOrderScreen. */
  cartKey: string;
  menuItemId: string;
  name: string;
  /** Base price without modifier surcharges (cents). */
  basePriceCents: number;
  /** Sum of all selected modifier surcharges (cents). */
  modifierExtraCents: number;
  qty: number;
  /** null = whole-table / no specific seat. */
  seat: number | null;
  modifiers: DraftModifier[];
  /** Per-item note — becomes special_instructions in the order payload. */
  note: string;
}

// ─── Context value ────────────────────────────────────────────────────────────

interface PosDraftContextValue {
  /** All draft items for a table across all seats. */
  getTableDraft(tableId: string): DraftItem[];
  /** Draft items for one specific seat (null = whole-table items). */
  getSeatDraft(tableId: string, seat: number | null): DraftItem[];
  /**
   * Replace draft items for a specific seat (atomic per-seat update).
   * Passing an empty array effectively clears that seat's draft.
   */
  setSeatDraft(tableId: string, seat: number | null, items: DraftItem[]): void;
  /** Remove all draft items for a table (called after posCreateOrder succeeds). */
  clearTableDraft(tableId: string): void;
}

// ─── Context & default value ──────────────────────────────────────────────────

export const PosDraftContext = createContext<PosDraftContextValue>({
  getTableDraft: () => [],
  getSeatDraft: () => [],
  setSeatDraft: () => {},
  clearTableDraft: () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

type DraftState = Record<string, DraftItem[]>;

export function PosDraftProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [state, setState] = useState<DraftState>({});

  const getTableDraft = useCallback(
    (tableId: string): DraftItem[] => state[tableId] ?? [],
    [state],
  );

  const getSeatDraft = useCallback(
    (tableId: string, seat: number | null): DraftItem[] =>
      (state[tableId] ?? []).filter((item) => item.seat === seat),
    [state],
  );

  const setSeatDraft = useCallback(
    (tableId: string, seat: number | null, items: DraftItem[]) => {
      setState((prev) => {
        // Remove all items for this seat, then append the new set.
        const rest = (prev[tableId] ?? []).filter((item) => item.seat !== seat);
        return { ...prev, [tableId]: [...rest, ...items] };
      });
    },
    [],
  );

  const clearTableDraft = useCallback((tableId: string) => {
    setState((prev) => {
      const next = { ...prev };
      delete next[tableId];
      return next;
    });
  }, []);

  return (
    <PosDraftContext.Provider
      value={{ getTableDraft, getSeatDraft, setSeatDraft, clearTableDraft }}
    >
      {children}
    </PosDraftContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePosDraft(): PosDraftContextValue {
  return useContext(PosDraftContext);
}
