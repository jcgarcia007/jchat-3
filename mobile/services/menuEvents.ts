/**
 * JChat 3.0 — "an order was sent from the menu sheet": the sheet closes itself and the chat behind shows a short
 * "Pedido enviado" notice. Tiny event hub (the two screens do not know each other).
 */

type Listener = () => void;
const listeners = new Set<Listener>();

export function emitMenuOrderSent(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeMenuOrderSent(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
