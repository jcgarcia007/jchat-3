/**
 * Height the fixed VenueDock ("Estás en {local}" and the orders in progress) takes at the BOTTOM of the screen, above the tab bar, measured from the
 * top edge of the dock's card (card height + the gap to what is under it; on the web, which has no tab bar, also the margin to the page edge). The dock
 * reports its real measured height while it is on screen and 0 when it is not (another route, the keyboard, nothing to show); the five tab screens add
 * it to their paddingBottom so nothing ends up under the card.
 *
 * `setInset` is the useState setter itself, so its identity never changes. VenueDock lists it in the dependencies of the effect whose cleanup reports 0:
 * a setter recreated with every inset (a closure inside a useMemo keyed on `inset`) re-ran that cleanup after each onLayout and the inset fell back to 0.
 */
import React, { createContext, useContext, useMemo, useState } from 'react';

interface HomeBarInsetValue {
  inset: number;
  setInset: (value: number) => void;
}

const HomeBarInsetContext = createContext<HomeBarInsetValue>({ inset: 0, setInset: () => undefined });

export function HomeBarInsetProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [inset, setInset] = useState(0);
  const value = useMemo<HomeBarInsetValue>(() => ({ inset, setInset }), [inset]);
  return <HomeBarInsetContext.Provider value={value}>{children}</HomeBarInsetContext.Provider>;
}

/** Extra bottom padding for the screens above the dock: 0 when the dock is hidden. */
export function useHomeBarInset(): number {
  return useContext(HomeBarInsetContext).inset;
}

/** Used by VenueDock to publish its measured height. Stable identity (the provider's useState setter). */
export function useReportHomeBarInset(): (value: number) => void {
  return useContext(HomeBarInsetContext).setInset;
}
