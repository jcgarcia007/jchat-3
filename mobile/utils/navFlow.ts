/**
 * Navigation helpers for the order flow (Menu → Cart → Checkout → PaymentSuccess → OrderTracking).
 * Screens of that flow must never be "gone back to" from a chat entry or from a finished order:
 * that creates loops (order → chat gate → "Not now" → order …). Leaving goes to the app's home.
 */

/** Screens that belong to ordering/paying. */
export const ORDER_FLOW_SCREENS = new Set([
  'Menu',
  'MenuWebPreview',
  'ProductDetail',
  'Cart',
  'Checkout',
  'PaymentSuccess',
  'OrderTracking',
]);

interface NavLike {
  getState: () => { index: number; routes: { name: string }[] };
  canGoBack: () => boolean;
  goBack: () => void;
  // The concrete navigators type reset() by their own param list; the shape passed here is always valid.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reset: (state: any) => void;
}

/** Name of the screen below the current one in the stack, or null. */
export function previousRouteName(navigation: NavLike): string | null {
  const state = navigation.getState();
  return state.routes[state.index - 1]?.name ?? null;
}

/** Resets the stack to the main tabs (the app's home). */
export function resetToTabs(navigation: NavLike): void {
  navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
}

/** Resets the stack to [Tabs, <screen>] so "back" from <screen> goes home. */
export function resetToTabsThen(navigation: NavLike, name: string, params?: object): void {
  navigation.reset({ index: 1, routes: [{ name: 'Tabs' }, { name, params }] });
}

/** Goes back, unless the previous screen is part of the order flow (or there is none): then → home. */
export function goBackOrHome(navigation: NavLike): void {
  const prev = previousRouteName(navigation);
  if (!navigation.canGoBack() || (prev !== null && ORDER_FLOW_SCREENS.has(prev))) {
    resetToTabs(navigation);
  } else {
    navigation.goBack();
  }
}
