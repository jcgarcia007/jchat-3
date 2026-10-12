/**
 * JChat 3.0 — useIncomingDmNotice: while `enabled` (the profile sheet is open) a direct message that arrives from
 * someone else becomes a short floating notice (name + text) that opens that conversation when tapped.
 * Native push banners for DMs are intentionally silent while the app is open, so this is the in-app notice.
 * One Realtime channel (useResilientChannel: unsubscribed on unmount, recovers by itself).
 */

import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../context/AuthContext';
import { useResilientChannel } from './useResilientChannel';
import { isSupabaseConfigured } from '../services/supabase';
import { getPublicProfile } from '../services/users';
import type { DmMessageRow } from '../services/dms';
import { dmPreviewKind } from '../utils/dmPreview';

export interface IncomingDmNotice {
  conversationId: string;
  senderId: string;
  name: string;
  text: string;
}

export function useIncomingDmNotice(enabled: boolean): { notice: IncomingDmNotice | null; dismiss: () => void } {
  const { user } = useAuth();
  const { t } = useTranslation('social');
  const [notice, setNotice] = useState<IncomingDmNotice | null>(null);
  const namesRef = useRef(new Map<string, string>());
  const meId = user?.id ?? '';

  useResilientChannel({
    enabled: enabled && isSupabaseConfigured && !!meId,
    name: `profile-dm-notice:${meId}`,
    scopeKey: meId,
    configure: (channel) =>
      channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_messages' }, (payload) => {
        const row = payload.new as DmMessageRow;
        if (!row || row.sender_id === meId) return;
        const kind = dmPreviewKind(row);
        const text =
          kind === 'photo' ? t('inbox.previewPhoto')
          : kind === 'voice' ? t('inbox.previewVoice')
          : kind === 'gift' ? t('inbox.previewGift')
          : row.body ?? '';
        void (async () => {
          let name = namesRef.current.get(row.sender_id);
          if (!name) {
            try {
              const profile = await getPublicProfile(row.sender_id);
              name = profile?.display_name?.trim() || profile?.username || '';
            } catch {
              name = '';
            }
            namesRef.current.set(row.sender_id, name);
          }
          setNotice({ conversationId: row.conversation_id, senderId: row.sender_id, name: name || t('inbox.title'), text });
        })();
      }),
  });

  const dismiss = useCallback(() => setNotice(null), []);
  return { notice, dismiss };
}
