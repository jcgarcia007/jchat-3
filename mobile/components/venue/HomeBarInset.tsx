/**
 * Height the fixed HomeStatusBar ("You're at {venue}" / "N orders in progress") takes above the tab bar.
 * The bar reports its real measured height (plus the gap to the tab bar) while it is on screen and 0 when it
 * is not; the scrollable content of the tab screens adds it to its bottom padding so the last row is never
 * hidden behind the bar.
 */
import React, { createContext, useContext, useMemo, useState } from 'react';

interface HomeBarInsetValue {
  inset: number;
  setInset: (value: number) => void;
}

const HomeBarInsetContext = createContext<HomeBarInsetValue>({ inset: 0, setInset: () => undefined });

export function HomeBarInsetProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [inset, setInsetState] = useState(0);
  const value = useMemo<HomeBarInsetValue>(
    () => ({ inset, setInset: (next) => setInsetState((prev) => (Math.abs(prev - next) < 0.5 ? prev : next)) }),
    [inset],
  );
  return <HomeBarInsetContext.Provider value={value}>{children}</HomeBarInsetContext.Provider>;
}

/** Extra bottom padding for scrollable tab content: 0 when the bar is hidden. */
export function useHomeBarInset(): number {
  return useContext(HomeBarInsetContext).inset;
}

/** Used by HomeStatusBar to publish its measured height. */
export function useReportHomeBarInset(): (value: number) => void {
  return useContext(HomeBarInsetContext).setInset;
}
