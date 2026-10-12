/**
 * JChat 3.0 — where AppModal draws (iOS / Android): the whole window. Content positioned from window coordinates
 * (measureInWindow) needs no correction here. The web variant (useAppModalFrame.web.ts) returns the app column.
 */

import { useWindowDimensions } from 'react-native';

export function useAppModalFrame(): { left: number; width: number } {
  const { width } = useWindowDimensions();
  return { left: 0, width };
}
