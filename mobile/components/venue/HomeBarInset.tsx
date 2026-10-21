/**
 * Height the fixed HomeStatusBar ("You're at {venue}" / "N orders in progress") takes at the TOP of the screen,
 * measured from the bottom edge of the safe area. The bar reports its real measured height (plus its offset below the
 * safe area and the gap under it) while it is on screen and 0 when it is not; the screens add it to their top padding
 * so their header and content start below the bar instead of under it.
 *
 * `setInset` is the useState setter itself, so its identity never changes. HomeStatusBar lists it in the dependencies
 * of the effect whose cleanup reports 0: a setter recreated with every inset (a closure inside a useMemo keyed on
 * `inset`) re-ran that cleanup after each onLayout and the inset fell back to 0.
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

/** Extra top padding for the screens under the bar: 0 when the bar is hidden. */
export function useHomeBarInset(): number {
  return useContext(HomeBarInsetContext).inset;
}

/** Used by HomeStatusBar to publish its measured height. Stable identity (the provider's useState setter). */
export function useReportHomeBarInset(): (value: number) => void {
  return useContext(HomeBarInsetContext).setInset;
}
