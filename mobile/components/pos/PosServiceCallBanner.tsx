/**
 * JChat 3.0 — PosServiceCallBanner
 *
 * Visible notice for a service call that just came in while the waiter is in POS / Work Mode
 * (the sound and vibration come from usePosAlerts). Sits on top, disappears after 6 s, tap to dismiss.
 *   order  → "Pedido #N · Voy en camino / Ya llegué al local / Pregunta: …"
 *   waiter → "Mesa X · Llamada al mesero"  (guest: "Invitado · Mesa X")
 *   help   → "Ayuda discreta · Mesa X"
 */

import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { IconBellRinging } from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { parseOrderNotice } from '../../utils/orderNotice';
import type { PosServiceCallRow } from '../../hooks/usePosAlerts';

const VISIBLE_MS = 6000;

interface Props {
  row: PosServiceCallRow;
  onDismiss: () => void;
}

export function PosServiceCallBanner({ row, onDismiss }: Props): React.ReactElement {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation('settings');

  useEffect(() => {
    const timer = setTimeout(onDismiss, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const table = row.table_label ? t('pos.serviceAlert.table', { table: row.table_label }) : null;
  let text: string;
  if (row.type === 'order') {
    const n = parseOrderNotice(row.notes);
    const head = n.orderNumber ? t('pos.serviceAlert.order', { n: n.orderNumber }) : t('pos.serviceAlert.orderNoNumber');
    const kind =
      n.kind === 'on_my_way'
        ? t('pos.serviceAlert.onMyWay')
        : n.kind === 'arrived'
          ? t('pos.serviceAlert.arrived')
          : n.kind === 'question'
            ? t('pos.serviceAlert.question', { text: n.text ?? '' })
            : (n.text ?? '');
    text = kind ? `${head} · ${kind}` : head;
  } else if (row.type === 'help') {
    text = [t('pos.serviceAlert.help'), table].filter(Boolean).join(' · ');
  } else if (row.type === 'waiter' || row.type === 'assistance') {
    const who = row.guest_device_id ? t('pos.serviceAlert.guest') : null;
    text = row.guest_device_id
      ? [who, table].filter(Boolean).join(' · ')
      : [table, t('pos.serviceAlert.waiter')].filter(Boolean).join(' · ');
  } else {
    text = [table, t('pos.serviceAlert.generic')].filter(Boolean).join(' · ');
  }

  return (
    <Pressable
      onPress={onDismiss}
      accessibilityRole="alert"
      accessibilityLabel={text}
      accessibilityHint={t('pos.serviceAlert.dismissHint')}
      style={[
        styles.banner,
        { top: insets.top + 8, backgroundColor: c.bgSurface, borderColor: c.borderSubtle },
      ]}
    >
      <IconBellRinging size={22} color={palette.brand} strokeWidth={2} />
      <Text style={[styles.text, { color: c.textPrimary }]} numberOfLines={3}>
        {text}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 1000,
    elevation: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: palette.shadow,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  text: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
});
