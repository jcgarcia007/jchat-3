/**
 * JChat 3.0 — useProfileMenuHint: the one-time "Tu perfil está aquí" hint (opción A).
 * Shown the first time a person is inside a venue chat (after this version), once per account:
 *   - the flag lives on the device (AsyncStorage, instant, offline) AND in the account (users.settings.hints);
 *   - dismissing saves the device flag first, then the account flag; if the account save fails the hint is still
 *     not shown again on this device and the save is retried the next time a chat opens (utils/profileHint).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { loadProfileHintSeen, markProfileHintSeen } from '../services/userSettings';
import { decideProfileHint, profileHintStorageKey } from '../utils/profileHint';

async function readLocal(userId: string): Promise<boolean | null> {
  try {
    const value = await AsyncStorage.getItem(profileHintStorageKey(userId));
    return value === null ? false : value === '1';
  } catch {
    return null;
  }
}

async function writeLocal(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(profileHintStorageKey(userId), '1');
  } catch {
    // Storage unavailable: the account flag still stops it from coming back on the next sign-in.
  }
}

export function useProfileMenuHint({ userId, enabled }: { userId: string | undefined; enabled: boolean }): { visible: boolean; dismiss: () => void } {
  const [visible, setVisible] = useState(false);
  const decidedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !userId || decidedForRef.current === userId) return undefined;
    let cancelled = false;
    void (async () => {
      const [local, remote] = await Promise.all([readLocal(userId), loadProfileHintSeen(userId).catch(() => null)]);
      if (cancelled) return;
      decidedForRef.current = userId;
      const decision = decideProfileHint({ local, remote });
      if (decision.syncLocal) void writeLocal(userId);
      if (decision.syncRemote) void markProfileHintSeen(userId).catch(() => undefined);
      if (decision.show) setVisible(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, userId]);

  const dismiss = useCallback(() => {
    setVisible(false);
    if (!userId) return;
    void writeLocal(userId).then(() => markProfileHintSeen(userId)).catch(() => undefined);
  }, [userId]);

  return { visible, dismiss };
}
