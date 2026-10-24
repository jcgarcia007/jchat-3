/**
 * JChat 3.0 — which routes of the root stack survive when the app goes back to the Map tab (pure: runs in Node tests).
 *
 * A confirmed exit (or leaving the venue on purpose) must always land on the Map, whatever is on the stack above the
 * venue chat (a DM, a profile, the menu, the games…). The 'Tabs' route that is already there is KEPT (same key, so the
 * map does not remount or lose its state) and everything above it is dropped; if there is none, a fresh one is made.
 */

export interface RootRouteLite {
  key?: string;
  name: string;
}

export type MapResetPlan =
  | { kind: 'keep'; count: number } // keep routes[0 .. count - 1]; the last one is the existing Tabs
  | { kind: 'fresh' }; // no Tabs route in the stack: reset to a new one

export function planMapReset(routes: readonly RootRouteLite[]): MapResetPlan {
  const tabsIndex = routes.findIndex((r) => r.name === 'Tabs');
  return tabsIndex === -1 ? { kind: 'fresh' } : { kind: 'keep', count: tabsIndex + 1 };
}
