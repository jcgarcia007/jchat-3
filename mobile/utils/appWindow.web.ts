/**
 * JChat 3.0 — app window size (web): on browsers wider than WEB_WIDE_BREAKPOINT the app is shown in a
 * WEB_COLUMN_WIDTH column (components/common/WebFrame.web.tsx), so layouts that size themselves from the
 * window width must see the column width, not the browser width. Narrower windows are returned as is.
 */

import { Dimensions, useWindowDimensions, type ScaledSize } from 'react-native';

export const WEB_WIDE_BREAKPOINT = 560;
export const WEB_COLUMN_WIDTH = 480;

function clampToColumn(size: ScaledSize): ScaledSize {
  return size.width > WEB_WIDE_BREAKPOINT ? { ...size, width: WEB_COLUMN_WIDTH } : size;
}

export function getAppWindow(): ScaledSize {
  return clampToColumn(Dimensions.get('window'));
}

export function useAppWindow(): ScaledSize {
  return clampToColumn(useWindowDimensions());
}
