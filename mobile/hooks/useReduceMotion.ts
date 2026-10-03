import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Whether the user turned on "Reduce motion". `null` until the OS answers (callers should not
 * start decorative animations yet), then true/false; it also follows later changes.
 */
export function useReduceMotion(): boolean | null {
  const [reduce, setReduce] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (alive) setReduce(enabled);
      })
      .catch(() => {
        if (alive) setReduce(false);
      });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      if (alive) setReduce(enabled);
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return reduce;
}
