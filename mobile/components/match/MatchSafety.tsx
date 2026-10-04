/**
 * JChat 3.0 — Match safety menu + sheets (Fase D4/D7)
 *
 * `useMatchSafety` gives a ⋯ menu (Report / Block / Ask the venue for help) and the sheets it
 * opens. Screens call `openMenu()` and render `sheets`.
 *  - Report: harassment / explicit / minor / scam / other + optional details → match_report
 *    (reaches the venue owner and the JChat team) → "Thanks, we'll review it".
 *  - Help: discreet sheet ("we'll alert the venue staff without anyone else seeing it") with an
 *    optional table/area → match_request_help → discreet confirmation.
 *  - Block: confirm → block_user; the person disappears from deck, matches and chats (onBlocked
 *    lets the screen refresh/leave).
 */

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import {
  MATCH_REPORT_REASONS,
  matchBlock,
  matchReport,
  matchRequestHelp,
} from '../../services/matchSafety';
import type { MatchReportReason } from '../../services/matchSafety';

interface UseMatchSafetyArgs {
  businessId: string;
  /** Chat room of the venue (for the help request); null when unknown. */
  roomId: string | null;
  /** The other person (report/block target). Null on screens without a target (help only). */
  targetUserId: string | null;
  targetName: string;
  /** Called after a successful block so the screen can refresh or leave. */
  onBlocked?: () => void;
}

type Sheet = 'report' | 'help' | null;

export function useMatchSafety({ businessId, roomId, targetUserId, targetName, onBlocked }: UseMatchSafetyArgs) {
  const { t } = useTranslation('match');
  const [sheet, setSheet] = useState<Sheet>(null);

  const confirmBlock = useCallback(() => {
    if (!targetUserId) return;
    Alert.alert(t('safety.blockTitle', { name: targetName }), t('safety.blockBody'), [
      { text: t('safety.cancel'), style: 'cancel' },
      {
        text: t('safety.block'),
        style: 'destructive',
        onPress: () => {
          void matchBlock(targetUserId)
            .then(() => onBlocked?.())
            .catch(() => Alert.alert(t('safety.error')));
        },
      },
    ]);
  }, [targetUserId, targetName, onBlocked, t]);

  const openMenu = useCallback(() => {
    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [];
    if (targetUserId) {
      buttons.push({ text: t('safety.report'), onPress: () => setSheet('report') });
      buttons.push({ text: t('safety.block'), style: 'destructive', onPress: confirmBlock });
    }
    buttons.push({ text: t('safety.help'), onPress: () => setSheet('help') });
    buttons.push({ text: t('menu.cancel'), style: 'cancel' });
    Alert.alert(t('safety.menuTitle'), undefined, buttons);
  }, [targetUserId, confirmBlock, t]);

  const sheets = (
    <>
      <ReportSheet
        visible={sheet === 'report' && !!targetUserId}
        businessId={businessId}
        targetUserId={targetUserId}
        onClose={() => setSheet(null)}
      />
      <HelpSheet visible={sheet === 'help'} businessId={businessId} roomId={roomId} onClose={() => setSheet(null)} />
    </>
  );

  return { openMenu, openHelp: () => setSheet('help'), sheets };
}

// ── Sheets ───────────────────────────────────────────────────────────────────────────────────

function SheetFrame({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const c = useThemeColors();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="" />
        <View style={[styles.sheet, { backgroundColor: c.bgSurface, borderTopColor: c.borderSubtle }]}>
          <View style={[styles.handle, { backgroundColor: c.borderSubtle }]} />
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const c = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={[styles.primaryBtn, { backgroundColor: c.brand, opacity: disabled || loading ? 0.5 : 1 }]}
    >
      {loading ? (
        <ActivityIndicator color={palette.onBrand} />
      ) : (
        <Text style={[styles.primaryBtnText, { color: palette.onBrand }]}>{label}</Text>
      )}
    </Pressable>
  );
}

function ReportSheet({
  visible,
  businessId,
  targetUserId,
  onClose,
}: {
  visible: boolean;
  businessId: string;
  targetUserId: string | null;
  onClose: () => void;
}) {
  const c = useThemeColors();
  const { t } = useTranslation('match');
  const [reason, setReason] = useState<MatchReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const close = useCallback(() => {
    setReason(null);
    setDetails('');
    setDone(false);
    onClose();
  }, [onClose]);

  const submit = useCallback(async () => {
    if (!reason || !targetUserId) return;
    setSending(true);
    try {
      await matchReport(businessId, targetUserId, reason, details);
      setDone(true);
    } catch {
      Alert.alert(t('safety.error'));
    } finally {
      setSending(false);
    }
  }, [reason, targetUserId, businessId, details, t]);

  return (
    <SheetFrame visible={visible} onClose={close}>
      {done ? (
        <>
          <Text style={[styles.title, { color: c.textPrimary }]}>{t('safety.reportThanks')}</Text>
          <Text style={[styles.body, { color: c.textSecondary }]}>{t('safety.reportThanksBody')}</Text>
          <PrimaryButton label={t('safety.close')} onPress={close} />
        </>
      ) : (
        <>
          <Text style={[styles.title, { color: c.textPrimary }]}>{t('safety.reportTitle')}</Text>
          {MATCH_REPORT_REASONS.map((r) => {
            const active = reason === r;
            return (
              <Pressable
                key={r}
                onPress={() => setReason(r)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={[
                  styles.reasonRow,
                  { borderColor: active ? c.brand : c.borderSubtle, backgroundColor: c.bgElevated },
                ]}
              >
                <View style={[styles.radio, { borderColor: active ? c.brand : c.textTertiary }]}>
                  {active && <View style={[styles.radioDot, { backgroundColor: c.brand }]} />}
                </View>
                <Text style={[styles.reasonText, { color: c.textPrimary }]}>{t(`safety.reasons.${r}`)}</Text>
              </Pressable>
            );
          })}
          <TextInput
            value={details}
            onChangeText={setDetails}
            placeholder={t('safety.detailsPlaceholder')}
            placeholderTextColor={c.textTertiary}
            maxLength={500}
            multiline
            style={[styles.input, { color: c.textPrimary, borderColor: c.borderSubtle, backgroundColor: c.bgElevated }]}
            accessibilityLabel={t('safety.detailsPlaceholder')}
          />
          <PrimaryButton label={t('safety.send')} onPress={() => void submit()} disabled={!reason} loading={sending} />
        </>
      )}
    </SheetFrame>
  );
}

function HelpSheet({
  visible,
  businessId,
  roomId,
  onClose,
}: {
  visible: boolean;
  businessId: string;
  roomId: string | null;
  onClose: () => void;
}) {
  const c = useThemeColors();
  const { t } = useTranslation('match');
  const [where, setWhere] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const close = useCallback(() => {
    setWhere('');
    setDone(false);
    onClose();
  }, [onClose]);

  const submit = useCallback(async () => {
    setSending(true);
    try {
      await matchRequestHelp(businessId, roomId, where);
      setDone(true);
    } catch {
      Alert.alert(t('safety.error'));
    } finally {
      setSending(false);
    }
  }, [businessId, roomId, where, t]);

  return (
    <SheetFrame visible={visible} onClose={close}>
      {done ? (
        <>
          <Text style={[styles.title, { color: c.textPrimary }]}>{t('safety.helpSent')}</Text>
          <Text style={[styles.body, { color: c.textSecondary }]}>{t('safety.helpSentBody')}</Text>
          <PrimaryButton label={t('safety.close')} onPress={close} />
        </>
      ) : (
        <>
          <Text style={[styles.title, { color: c.textPrimary }]}>{t('safety.helpTitle')}</Text>
          <Text style={[styles.body, { color: c.textSecondary }]}>{t('safety.helpBody')}</Text>
          <TextInput
            value={where}
            onChangeText={setWhere}
            placeholder={t('safety.helpWherePlaceholder')}
            placeholderTextColor={c.textTertiary}
            maxLength={40}
            style={[styles.input, { color: c.textPrimary, borderColor: c.borderSubtle, backgroundColor: c.bgElevated }]}
            accessibilityLabel={t('safety.helpWherePlaceholder')}
          />
          <PrimaryButton label={t('safety.helpSend')} onPress={() => void submit()} loading={sending} />
        </>
      )}
    </SheetFrame>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: palette.scrimMedium },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 12,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  title: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 20 },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 12,
  },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  reasonText: { fontSize: 15, flex: 1 },
  input: {
    minHeight: 48,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  primaryBtn: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  primaryBtnText: { fontSize: 16, fontWeight: '700' },
});
