/**
 * JChat 3.0 — VenueSessionBar
 *
 * Fixed bar above the tab bar while the user is "in a venue": "Estás en {negocio} · N mensajes · N likes"
 * plus a Back button that reopens the chat instantly (no entry notice, no verification).
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { IconMapPin } from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { useVenueSession } from '../../context/VenueSessionContext';

/** Tab bar geometry (components/navigation/NotchTabBar): bottom offset 26 + inset, height 68. */
const TAB_BAR_TOP_OFFSET = 26 + 68;
const GAP = 10;

interface Props {
  /** Opens the chat room of the session. */
  onOpenChat: (roomId: string) => void;
}

export function VenueSessionBar({ onOpenChat }: Props): React.ReactElement | null {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation('chat');
  const { session, unreadMessages, likeCount } = useVenueSession();
  if (!session) return null;

  const parts = [t('venueSession.here', { business: session.businessName })];
  if (unreadMessages > 0) parts.push(t('venueSession.messages', { count: unreadMessages }));
  if (likeCount > 0) parts.push(t('venueSession.likes', { count: likeCount }));
  const text = parts.join(' · ');

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: insets.bottom + TAB_BAR_TOP_OFFSET + GAP }]}
    >
      <View style={[styles.bar, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
        <IconMapPin size={20} color={palette.brand} strokeWidth={2} />
        <Text style={[styles.text, { color: c.textPrimary }]} numberOfLines={1}>
          {text}
        </Text>
        <Pressable
          onPress={() => onOpenChat(session.roomId)}
          accessibilityRole="button"
          accessibilityLabel={t('venueSession.backA11y', { business: session.businessName })}
          style={({ pressed }) => [styles.button, { backgroundColor: palette.brand, opacity: pressed ? 0.85 : 1 }]}
        >
          <Text style={[styles.buttonLabel, { color: palette.onBrand }]}>{t('venueSession.back')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, zIndex: 900 },
  bar: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: palette.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  text: { flex: 1, fontSize: 14, fontWeight: '600' },
  button: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: { fontSize: 14, fontWeight: '700' },
});
