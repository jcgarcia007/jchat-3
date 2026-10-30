import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

import { reduceTransparencyActive } from '../utils/reduceTransparency';

/** True while iOS's "Reduce transparency" is on (it follows the setting live). Always false on Android and web. */
export function useReduceTransparency(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined;
    let alive = true;
    AccessibilityInfo.isReduceTransparencyEnabled().then((value) => { if (alive) setEnabled(value); }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setEnabled);
    return () => { alive = false; subscription.remove(); };
  }, []);
  return reduceTransparencyActive(Platform.OS, enabled);
}
