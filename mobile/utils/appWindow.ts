/**
 * JChat 3.0 — app window size (iOS / Android): the real window, same as React Native's
 * Dimensions / useWindowDimensions. The web build resolves appWindow.web.ts, where the app lives in a
 * phone-width column (WebFrame) and layouts must size themselves to that column, not to the browser.
 */

import { Dimensions, useWindowDimensions } from 'react-native';

export function getAppWindow() {
  return Dimensions.get('window');
}

export function useAppWindow() {
  return useWindowDimensions();
}
