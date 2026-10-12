/**
 * JChat 3.0 — WebFrame (web): on screens wider than 560 px the app is centered in a 480 px column over
 * the theme background (the chat is designed for a phone). Below that it fills the viewport as is.
 * useWindowDimensions follows window.innerWidth and re-renders on resize.
 */

import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useThemeColors } from '../../theme/colors';
import { WEB_COLUMN_WIDTH, WEB_WIDE_BREAKPOINT } from '../../utils/appWindow.web';
import { PROFILE_PANEL_WIDTH, useProfilePanelOpen } from '../../utils/profilePanelStore';

export default function WebFrame({ children }: { children: React.ReactNode }): React.ReactElement {
  const c = useThemeColors();
  const { width } = useWindowDimensions();
  // Wide screen with the profile as a right-hand panel: the phone-width column moves left so the chat stays
  // visible and usable next to it (the panel is drawn by ProfileSheetFrame, position: absolute at the right).
  const panelOpen = useProfilePanelOpen();

  if (width <= WEB_WIDE_BREAKPOINT) return <>{children}</>;

  return (
    <View style={[styles.backdrop, { backgroundColor: c.bgBase }, panelOpen ? { alignItems: 'flex-start', paddingLeft: Math.max(0, (width - PROFILE_PANEL_WIDTH - WEB_COLUMN_WIDTH) / 2) } : null]}>
      <View style={[styles.column, { backgroundColor: c.bgBase, borderColor: c.borderSubtle }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center' },
  column: { flex: 1, width: WEB_COLUMN_WIDTH, maxWidth: '100%', borderLeftWidth: 1, borderRightWidth: 1 },
});
