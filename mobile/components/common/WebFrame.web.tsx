/**
 * JChat 3.0 — WebFrame (web): on screens wider than 560 px the app is centered in a 480 px column over
 * the theme background (the chat is designed for a phone). Below that it fills the viewport as is.
 * useWindowDimensions follows window.innerWidth and re-renders on resize.
 */

import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useThemeColors } from '../../theme/colors';
import { WEB_COLUMN_WIDTH, WEB_WIDE_BREAKPOINT } from '../../utils/appWindow.web';

export default function WebFrame({ children }: { children: React.ReactNode }): React.ReactElement {
  const c = useThemeColors();
  const { width } = useWindowDimensions();

  if (width <= WEB_WIDE_BREAKPOINT) return <>{children}</>;

  return (
    <View style={[styles.backdrop, { backgroundColor: c.bgBase }]}>
      <View style={[styles.column, { backgroundColor: c.bgBase, borderColor: c.borderSubtle }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center' },
  column: { flex: 1, width: WEB_COLUMN_WIDTH, maxWidth: '100%', borderLeftWidth: 1, borderRightWidth: 1 },
});
