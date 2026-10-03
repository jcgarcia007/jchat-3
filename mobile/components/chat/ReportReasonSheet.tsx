/**
 * JChat 3.0 — ReportReasonSheet
 *
 * Bottom sheet (RN Modal) to pick why a user is being reported. Rendered once at the
 * screen level and shared by UserQuickCard and UserActionSheet, so a report always carries
 * a reason code instead of a fixed text.
 */

import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableWithoutFeedback, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useThemeColors } from '../../theme/colors';

/** Codes stored in reports.reason (free text column). */
export const REPORT_REASONS = ['spam', 'harassment', 'inappropriate_content', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

interface ReportReasonSheetProps {
  visible: boolean;
  targetName: string;
  onSelect: (reason: ReportReason) => void;
  onClose: () => void;
}

export function ReportReasonSheet({ visible, targetName, onSelect, onClose }: ReportReasonSheetProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation('chat');

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
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {t('report.title', { name: targetName })}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('report.subtitle')}</Text>

        {REPORT_REASONS.map((reason) => (
          <Pressable
            accessibilityRole="button"
            key={reason}
            onPress={() => onSelect(reason)}
            style={[styles.option, { borderBottomColor: colors.borderSubtle }]}
          >
            <Text style={[styles.optionLabel, { color: colors.textPrimary }]}>{t(`report.reason.${reason}`)}</Text>
          </Pressable>
        ))}

        <Pressable accessibilityRole="button" onPress={onClose} style={styles.cancel}>
          <Text style={[styles.cancelLabel, { color: colors.textSecondary }]}>
            {t('actions.cancel', { ns: 'common' })}
          </Text>
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
  title: { fontSize: 17, fontWeight: '700', marginTop: 4 },
  subtitle: { fontSize: 13, lineHeight: 18, marginBottom: 6, marginTop: 4 },
  option: { borderBottomWidth: StyleSheet.hairlineWidth, justifyContent: 'center', minHeight: 52 },
  optionLabel: { fontSize: 16 },
  cancel: { alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  cancelLabel: { fontSize: 16, fontWeight: '600' },
});
