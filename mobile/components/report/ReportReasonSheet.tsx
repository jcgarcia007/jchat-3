/**
 * JChat 3.0 — ReportReasonSheet (v2, migration 212)
 *
 * One sheet for every report in the app (users, posts, comments, chat messages, DMs). The person picks a reason, may add
 * a detail (required for "Other"), and the sheet sends it through report_content. Child safety is the first, highlighted
 * option, with the emergency note. On success it says the report is reviewed in under 24 h.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { IconAlertTriangle, IconCheck } from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { reportContent, ReportError } from '../../services/reports';
import {
  REPORT_DETAILS_MAX,
  REPORT_REASONS_DISPLAY,
  URGENT_REPORT_REASON,
  reportErrorKey,
  reportNeedsDetails,
  type ReportContentType,
  type ReportReason,
} from '../../utils/reportReasons';

interface ReportReasonSheetProps {
  visible: boolean;
  /** Who/what is being reported, for the title ("Report {{name}}"). */
  targetName: string;
  contentType: ReportContentType;
  /** The user id when contentType is 'user'; otherwise the id of the post / comment / message. */
  contentId: string;
  onClose: () => void;
}

type Phase = 'form' | 'sending' | 'sent';

export function ReportReasonSheet({ visible, targetName, contentType, contentId, onClose }: ReportReasonSheetProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [phase, setPhase] = useState<Phase>('form');
  const [error, setError] = useState<string | null>(null);

  // Every opening starts clean.
  useEffect(() => {
    if (visible) {
      setReason(null);
      setDetails('');
      setPhase('form');
      setError(null);
    }
  }, [visible]);

  const needsDetails = reason !== null && reportNeedsDetails(reason);
  const canSend = reason !== null && phase === 'form' && (!needsDetails || details.trim().length > 0);

  const send = useCallback(async () => {
    if (!reason || phase !== 'form') return;
    if (needsDetails && !details.trim()) {
      setError(t('report.errors.detailsRequired'));
      return;
    }
    setPhase('sending');
    setError(null);
    try {
      await reportContent(contentType, contentId, reason, details);
      setPhase('sent');
    } catch (err) {
      const key = err instanceof ReportError ? err.key : reportErrorKey(err);
      setError(t(`report.errors.${key}`));
      setPhase('form');
    }
  }, [reason, phase, needsDetails, details, contentType, contentId, t]);

  return (
    <Modal animationType="slide" onRequestClose={onClose} statusBarTranslucent transparent visible={visible}>
      <TouchableWithoutFeedback accessible={false} onPress={onClose}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]} />
      </TouchableWithoutFeedback>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents="box-none"
        style={styles.avoider}
      >
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.bgSurface, borderTopColor: colors.borderSubtle, paddingBottom: insets.bottom + 12 },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.borderSubtle }]} />

          {phase === 'sent' ? (
            <View style={styles.sent}>
              <View style={[styles.sentIcon, { backgroundColor: colors.brandLight }]}>
                <IconCheck size={28} color={colors.brand} strokeWidth={2.5} />
              </View>
              <Text style={[styles.title, { color: colors.textPrimary }]}>{t('report.successTitle')}</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary, textAlign: 'center' }]}>
                {t('report.successMessage')}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={onClose}
                style={[styles.primary, { backgroundColor: colors.brand }]}
              >
                <Text style={[styles.primaryLabel, { color: palette.onBrand }]}>{t('actions.close')}</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.scroll} contentContainerStyle={styles.scrollContent}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>{t('report.title', { name: targetName })}</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('report.subtitle')}</Text>

              {REPORT_REASONS_DISPLAY.map((code) => {
                const selected = reason === code;
                const urgent = code === URGENT_REPORT_REASON;
                return (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    key={code}
                    onPress={() => { setReason(code); setError(null); }}
                    style={[
                      styles.option,
                      {
                        borderColor: selected ? colors.brand : urgent ? colors.danger : colors.borderSubtle,
                        backgroundColor: selected ? colors.brandLight : 'transparent',
                      },
                    ]}
                  >
                    {urgent ? <IconAlertTriangle size={20} color={colors.danger} strokeWidth={2.2} /> : null}
                    <View style={styles.optionText}>
                      <Text style={[styles.optionLabel, { color: urgent ? colors.danger : colors.textPrimary, fontWeight: urgent ? '800' : '500' }]}>
                        {t(`report.reasons.${code}`)}
                      </Text>
                      {urgent ? (
                        <Text style={[styles.optionHint, { color: colors.textSecondary }]}>{t('report.childSafetyHint')}</Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}

              {reason !== null && (
                <View style={styles.detailsBox}>
                  <Text style={[styles.detailsLabel, { color: colors.textSecondary }]}>
                    {needsDetails ? t('report.detailsRequired') : t('report.detailsOptional')}
                  </Text>
                  <TextInput
                    accessibilityLabel={t('report.detailsLabel')}
                    maxLength={REPORT_DETAILS_MAX}
                    multiline
                    onChangeText={setDetails}
                    placeholder={t('report.detailsPlaceholder')}
                    placeholderTextColor={colors.textTertiary}
                    style={[styles.details, { color: colors.textPrimary, borderColor: colors.borderSubtle, backgroundColor: colors.bgBase }]}
                    value={details}
                  />
                  <Text style={[styles.counter, { color: colors.textTertiary }]}>{details.length}/{REPORT_DETAILS_MAX}</Text>
                </View>
              )}

              {error ? (
                <Text accessibilityRole="alert" style={[styles.error, { color: colors.danger }]}>{error}</Text>
              ) : null}

              <Pressable
                accessibilityRole="button"
                disabled={!canSend}
                onPress={() => { void send(); }}
                style={[styles.primary, { backgroundColor: colors.brand, opacity: canSend ? 1 : 0.45 }]}
              >
                {phase === 'sending' ? (
                  <ActivityIndicator color={palette.onBrand} />
                ) : (
                  <Text style={[styles.primaryLabel, { color: palette.onBrand }]}>{t('report.send')}</Text>
                )}
              </Pressable>

              <Pressable accessibilityRole="button" onPress={onClose} style={styles.cancel}>
                <Text style={[styles.cancelLabel, { color: colors.textSecondary }]}>{t('actions.cancel')}</Text>
              </Pressable>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  avoider: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    maxHeight: '90%',
    paddingHorizontal: 20,
  },
  handle: { alignSelf: 'center', borderRadius: 2, height: 4, marginBottom: 8, marginTop: 12, width: 36 },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingBottom: 4 },
  title: { fontSize: 17, fontWeight: '700', marginTop: 4 },
  subtitle: { fontSize: 13, lineHeight: 18, marginBottom: 10, marginTop: 4 },
  option: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  optionText: { flex: 1 },
  optionLabel: { fontSize: 16 },
  optionHint: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  detailsBox: { marginTop: 6 },
  detailsLabel: { fontSize: 13, marginBottom: 6 },
  details: { borderRadius: 12, borderWidth: 1, fontSize: 15, minHeight: 84, padding: 12, textAlignVertical: 'top' },
  counter: { fontSize: 11, marginTop: 4, textAlign: 'right' },
  error: { fontSize: 13, marginTop: 8 },
  primary: { alignItems: 'center', borderRadius: 12, justifyContent: 'center', marginTop: 12, minHeight: 48 },
  primaryLabel: { fontSize: 16, fontWeight: '700' },
  cancel: { alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  cancelLabel: { fontSize: 16, fontWeight: '600' },
  sent: { alignItems: 'center', gap: 6, paddingVertical: 12 },
  sentIcon: { alignItems: 'center', borderRadius: 28, height: 56, justifyContent: 'center', marginBottom: 6, width: 56 },
});
