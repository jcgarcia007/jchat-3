/**
 * JChat 3.0 — InviteToastHost (web): draws the small "Abrir en JChat" notice of an invite moment (useInviteMoment.trigger).
 * One line + the "Abrir en JChat" button + a close X; it closes itself after 8 s, floats above the composer / content
 * without blocking it (pointerEvents only on the card) and never covers the screen. Mounted once, at the app root.
 */

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconX } from '@tabler/icons-react-native';

import { openAppFromWeb, subscribeInviteToast } from '../../services/inviteState';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { TOAST_AUTO_CLOSE_MS, type InviteMoment } from '../../utils/inviteMoments';

export function InviteToastHost(): React.ReactElement | null {
  const c = useThemeColors();
  const { t } = useTranslation('common');
  const [moment, setMoment] = useState<InviteMoment | null>(null);

  useEffect(() => subscribeInviteToast(setMoment), []);

  useEffect(() => {
    if (!moment) return undefined;
    const id = setTimeout(() => setMoment(null), TOAST_AUTO_CLOSE_MS);
    return () => clearTimeout(id);
  }, [moment]);

  if (!moment) return null;

  return (
    <View pointerEvents="box-none" style={styles.host}>
      <View testID="invite-toast" style={[styles.card, { backgroundColor: c.bgElevated, borderColor: c.borderSubtle }]}>
        <Text style={[styles.text, { color: c.textPrimary }]}>{t(moment === 'finished' ? 'invite.finished' : 'invite.firstMessage')}</Text>
        <View style={styles.actions}>
          <Pressable
            testID="invite-toast-open"
            onPress={openAppFromWeb}
            accessibilityRole="button"
            style={({ pressed }) => [styles.open, { backgroundColor: c.brandFill, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={[styles.openLabel, { color: palette.onBrand }]}>{t('invite.openInApp')}</Text>
          </Pressable>
          <Pressable
            testID="invite-toast-close"
            onPress={() => setMoment(null)}
            accessibilityRole="button"
            accessibilityLabel={t('invite.close')}
            style={styles.close}
          >
            <IconX size={18} color={c.textSecondary} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default InviteToastHost;

const styles = StyleSheet.create({
  // `fixed` (react-native-web): stays put above the composer whatever the screen scrolls.
  host: { position: 'fixed' as unknown as 'absolute', left: 12, right: 12, bottom: 132, alignItems: 'center', zIndex: 1000 },
  card: { width: '100%', maxWidth: 420, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 10, paddingLeft: 14, paddingRight: 4, gap: 8 },
  text: { fontSize: 14, lineHeight: 19, paddingRight: 10 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  open: { minHeight: 36, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  openLabel: { fontSize: 14, fontWeight: '700' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
