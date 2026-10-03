/**
 * JChat 3.0 — Cart context (Stage 3, shared by menu/detail/cart/checkout)
 * Holds the in-progress cart for a single business/room. Pure client state;
 * order creation happens server-side at checkout (Stripe — Task 3.6).
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import type { MenuItem, MenuOptionChoice } from '../services/menu';

export type OrderType = 'table' | 'counter' | 'gift';

/** Selected choices for one modifier group (new modifier-group system). */
export interface CartModifierSelection {
  groupId: string;
  groupLabel: string;
  choices: { label: string; price_cents: number }[];
}

export interface CartLine {
  /** Stable line id (item id + serialized options). */
  lineId: string;
  item: MenuItem;
  qty: number;
  size: MenuOptionChoice | null;
  extras: MenuOptionChoice[];
  /** Selected modifier groups (new system). Price already folded into unitPriceCents. */
  modifierSelections?: CartModifierSelection[];
  specialInstructions?: string;
  /** Unit price including selected size + extras + modifiers, in cents. */
  unitPriceCents: number;
}

interface CartContextValue {
  businessId: string | null;
  roomId: string | null;
  lines: CartLine[];
  orderType: OrderType;
  giftRecipientId: string | null;
  /** Free-text table/location for order_type = table (e.g. "5", "barra"). */
  tableLabel: string | null;
  itemCount: number;
  subtotalCents: number;
  setContext: (businessId: string, roomId: string | null) => void;
  addLine: (line: Omit<CartLine, 'lineId'>) => void;
  updateQty: (lineId: string, qty: number) => void;
  removeLine: (lineId: string) => void;
  setOrderType: (t: OrderType) => void;
  setGiftRecipient: (userId: string | null) => void;
  setTableLabel: (v: string | null) => void;
  clear: () => void;
}

/** How many of `item` the cart may hold in total (null = unlimited: stock isn't tracked). */
export function stockLimitOf(item: MenuItem): number | null {
  return typeof item.stock_count === 'number' && item.stock_count >= 0 ? item.stock_count : null;
}

/** Units of `item` already in other lines of the cart (same dish, different options). */
export function qtyOfItemInOtherLines(lines: CartLine[], itemId: string, exceptLineId: string): number {
  return lines
    .filter((l) => l.item.id === itemId && l.lineId !== exceptLineId)
    .reduce((n, l) => n + l.qty, 0);
}

function clampToStock(lines: CartLine[], item: MenuItem, lineId: string, wanted: number): number {
  const limit = stockLimitOf(item);
  if (limit === null) return wanted;
  return Math.max(0, Math.min(wanted, limit - qtyOfItemInOtherLines(lines, item.id, lineId)));
}

function makeLineId(
  itemId: string,
  size: MenuOptionChoice | null,
  extras: MenuOptionChoice[],
  modifierSelections?: CartModifierSelection[],
): string {
  const s = size?.label ?? '';
  const e = extras.map((x) => x.label).sort().join(',');
  const m = (modifierSelections ?? [])
    .map((g) => `${g.groupId}:${g.choices.map((ch) => ch.label).sort().join('|')}`)
    .sort()
    .join(';');
  return `${itemId}::${s}::${e}::${m}`;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [orderType, setOrderType] = useState<OrderType>('table');
  const [giftRecipientId, setGiftRecipientId] = useState<string | null>(null);
  const [tableLabel, setTableLabel] = useState<string | null>(null);

  const setContext = useCallback((bId: string, rId: string | null) => {
    setBusinessId((prev) => {
      // Switching business clears the cart.
      if (prev && prev !== bId) {
        setLines([]);
      }
      return bId;
    });
    setRoomId(rId);
  }, []);

  const addLine = useCallback((line: Omit<CartLine, 'lineId'>) => {
    const lineId = makeLineId(line.item.id, line.size, line.extras, line.modifierSelections);
    setLines((prev) => {
      const existing = prev.find((l) => l.lineId === lineId);
      const wanted = (existing?.qty ?? 0) + line.qty;
      // Never more than the stock the menu reported (null = stock is not tracked).
      const qty = clampToStock(prev, line.item, lineId, wanted);
      if (qty <= 0) return prev;
      if (existing) {
        return prev.map((l) => (l.lineId === lineId ? { ...l, qty } : l));
      }
      return [...prev, { ...line, qty, lineId }];
    });
  }, []);

  const updateQty = useCallback((lineId: string, qty: number) => {
    setLines((prev) => {
      if (qty <= 0) return prev.filter((l) => l.lineId !== lineId);
      const target = prev.find((l) => l.lineId === lineId);
      if (!target) return prev;
      const clamped = clampToStock(prev, target.item, lineId, qty);
      return prev.map((l) => (l.lineId === lineId ? { ...l, qty: clamped } : l));
    });
  }, []);

  const removeLine = useCallback((lineId: string) => {
    setLines((prev) => prev.filter((l) => l.lineId !== lineId));
  }, []);

  const clear = useCallback(() => {
    setLines([]);
    setGiftRecipientId(null);
    setTableLabel(null);
    setOrderType('table');
  }, []);

  const itemCount = useMemo(() => lines.reduce((n, l) => n + l.qty, 0), [lines]);
  const subtotalCents = useMemo(
    () => lines.reduce((n, l) => n + l.unitPriceCents * l.qty, 0),
    [lines],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      businessId,
      roomId,
      lines,
      orderType,
      giftRecipientId,
      tableLabel,
      itemCount,
      subtotalCents,
      setContext,
      addLine,
      updateQty,
      removeLine,
      setOrderType,
      setGiftRecipient: setGiftRecipientId,
      setTableLabel,
      clear,
    }),
    [
      businessId, roomId, lines, orderType, giftRecipientId, tableLabel,
      itemCount, subtotalCents, setContext, addLine, updateQty, removeLine, clear,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within a CartProvider');
  return ctx;
}
