/**
 * JChat 3.0 — where AppModal draws (web): the app column on wide screens (same numbers as AppModal.web.tsx), the
 * window otherwise. Content placed from window coordinates (measureInWindow) must subtract `left` and lay out in `width`.
 */

import { useWindowDimensions } from 'react-native';

import { WEB_COLUMN_WIDTH, WEB_WIDE_BREAKPOINT } from '../../utils/appWindow.web';
import { columnLeftWithPanel } from '../../utils/profilePanelLayout';
import { useProfilePanelOpen } from '../../utils/profilePanelStore';

export function useAppModalFrame(): { left: number; width: number } {
  const { width } = useWindowDimensions();
  const panelOpen = useProfilePanelOpen();
  if (width <= WEB_WIDE_BREAKPOINT) return { left: 0, width };
  return { left: panelOpen ? columnLeftWithPanel(width) : (width - WEB_COLUMN_WIDTH) / 2, width: WEB_COLUMN_WIDTH };
}
