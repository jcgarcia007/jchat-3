/**
 * JChat 3.0 — MessageActionSheet
 *
 * Opens on long-press of a message written by SOMEONE ELSE (chat of the venue, DMs): Report message, Block <name> and,
 * in the venue chat for owners/moderators, Pin. The parent runs the actions (report sheet, block confirmation, pin).
 */

import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableWithoutFeedback, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { IconBan, IconFlag, IconPin } from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';

interface MessageActionSheetProps {
  visible: boolean;
  /** Author's display name, for "Block <name>". */
  authorName: string;
  onReport: () => void;
  onBlock: () => void;
  /** Present only when the viewer can pin (owner / moderator in the venue chat). */
  onPin?: () => void;
  onClose: () => void;
}

export function MessageActionSheet({ visible, authorName, onReport, onBlock, onPin, onClose }: MessageActionSheetProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const row = (key: string, label: string, icon: React.ReactNode, color: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      key={key}
      onPress={onPress}
      style={[styles.row, { borderBottomColor: colors.borderSubtle }]}
    >
      {icon}
      <Text style={[styles.label, { color }]}>{label}</Text>
    </Pressable>
  );

  return (
    <Modal animationType="slide" onRequestClose={onClose} statusBarTranslucent transparent visible={visible}>
      <TouchableWithoutFeedback accessible={false} onPress={onClose}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]} />
      </TouchableWithoutFeedback>
      <View
        style={[
          styles.sheet,
          { backgroundColor: colors.bgSurface, borderTopColor: colors.borderSubtle, paddingBottom: insets.bottom + 12 },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: colors.borderSubtle }]} />
        {onPin ? row('pin', t('pin.pinButton', { ns: 'chat' }), <IconPin size={20} color={colors.textPrimary} />, colors.textPrimary, onPin) : null}
        {row('report', t('report.message'), <IconFlag size={20} color={colors.danger} />, colors.danger, onReport)}
        {row('block', t('report.block', { name: authorName }), <IconBan size={20} color={colors.danger} />, colors.danger, onBlock)}
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.cancel}>
          <Text style={[styles.cancelLabel, { color: colors.textSecondary }]}>{t('actions.cancel')}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    bottom: 0,
    left: 0,
    paddingHorizontal: 20,
    position: 'absolute',
    right: 0,
  },
  handle: { alignSelf: 'center', borderRadius: 2, height: 4, marginBottom: 8, marginTop: 12, width: 36 },
  row: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 12, minHeight: 52 },
  label: { fontSize: 16 },
  cancel: { alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  cancelLabel: { fontSize: 16, fontWeight: '600' },
});
