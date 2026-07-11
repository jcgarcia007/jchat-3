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
  promoCode: string | null;
  itemCount: number;
  subtotalCents: number;
  setContext: (businessId: string, roomId: string | null) => void;
  addLine: (line: Omit<CartLine, 'lineId'>) => void;
  updateQty: (lineId: string, qty: number) => void;
  removeLine: (lineId: string) => void;
  setOrderType: (t: OrderType) => void;
  setGiftRecipient: (userId: string | null) => void;
  setTableLabel: (v: string | null) => void;
  setPromoCode: (code: string | null) => void;
  clear: () => void;
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
  const [promoCode, setPromoCode] = useState<string | null>(null);

  const setContext = useCallback((bId: string, rId: string | null) => {
    setBusinessId((prev) => {
      // Switching business clears the cart.
      if (prev && prev !== bId) {
        setLines([]);
        setPromoCode(null);
      }
      return bId;
    });
    setRoomId(rId);
  }, []);

  const addLine = useCallback((line: Omit<CartLine, 'lineId'>) => {
    const lineId = makeLineId(line.item.id, line.size, line.extras, line.modifierSelections);
    setLines((prev) => {
      const existing = prev.find((l) => l.lineId === lineId);
      if (existing) {
        return prev.map((l) =>
          l.lineId === lineId ? { ...l, qty: l.qty + line.qty } : l,
        );
      }
      return [...prev, { ...line, lineId }];
    });
  }, []);

  const updateQty = useCallback((lineId: string, qty: number) => {
    setLines((prev) =>
      qty <= 0
        ? prev.filter((l) => l.lineId !== lineId)
        : prev.map((l) => (l.lineId === lineId ? { ...l, qty } : l)),
    );
  }, []);

  const removeLine = useCallback((lineId: string) => {
    setLines((prev) => prev.filter((l) => l.lineId !== lineId));
  }, []);

  const clear = useCallback(() => {
    setLines([]);
    setPromoCode(null);
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
      promoCode,
      itemCount,
      subtotalCents,
      setContext,
      addLine,
      updateQty,
      removeLine,
      setOrderType,
      setGiftRecipient: setGiftRecipientId,
      setTableLabel,
      setPromoCode,
      clear,
    }),
    [
      businessId, roomId, lines, orderType, giftRecipientId, tableLabel, promoCode,
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
