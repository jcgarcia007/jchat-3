/**
 * JChat 3.0 — Age gate (compliance P3).
 *
 * Rendered by AppNavigator in place of the main app while the signed-in user has
 * no server-side age confirmation (users.age_confirmed_at is null) — email,
 * Google, Apple and pre-existing accounts alike.
 *
 *  - Three numeric boxes (Day / Month / Year, month first in English) with NO default: they start empty.
 *    utils/birthDate.ts turns them into a real date; a pasted date is spread over the boxes.
 *  - Mandatory Terms/Privacy checkbox; Continue enabled only with a valid date and the checkbox.
 *  - Asks "is your date of birth …?" and then calls rpc confirm_age. The full
 *    date is never stored client-side; the server keeps only the year.
 *  - Underage → neutral message (never states the required age), account deleted
 *    through the existing delete-account flow, then sign out.
 *  - Could not read the status → fail closed with "Retry".
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from 'react-native';
import { Spinner } from '../../components/common/Spinner';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import * as WebBrowser from 'expo-web-browser';
import { IconCheck } from '@tabler/icons-react-native';

import { palette } from '../../theme/tokens';
import { useThemeColors } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import { confirmAge } from '../../services/age';
import { deleteMyAccount } from '../../services/account';
import { confirm, showAlert } from '../../utils/dialog';
import { fieldOrder, parseBirthDate, splitPastedDate, type DateParts, type FieldOrder } from '../../utils/birthDate';

const TERMS_URL = 'https://jchat.cloud/terms';
const PRIVACY_URL = 'https://jchat.cloud/privacy';

const LOCAL_COLORS = {
  onBrand: palette.onBrand,
  checkboxBorder: palette.neutralBorder,
} as const;

type FieldKey = keyof DateParts;

const EMPTY_DATE: DateParts = { day: '', month: '', year: '' };
const MAX_DIGITS: Record<FieldKey, number> = { day: 2, month: 2, year: 4 };
/** The year box is wider than day / month. */
const FIELD_FLEX: Record<FieldKey, number> = { day: 1, month: 1, year: 1.6 };
const FIELD_KEYS: Record<FieldOrder, FieldKey[]> = { dmy: ['day', 'month', 'year'], mdy: ['month', 'day', 'year'] };

/**
 * Time to move to the next box. A full box is done; so is a first digit that cannot start a 2-digit day (4-9) or
 * month (2-9), because the number pad has no "next" key on iOS. The year is the last box and never advances.
 */
function isFieldDone(key: FieldKey, digits: string): boolean {
  if (key === 'year') return false;
  if (digits.length >= MAX_DIGITS[key]) return true;
  if (digits.length !== 1) return false;
  return key === 'day' ? Number(digits) > 3 : Number(digits) > 1;
}

export default function ConfirmAgeScreen() {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation('auth');
  const { ageStatus, refreshAge, signOut } = useAuth();

  const order = fieldOrder(i18n.language);
  const keys = FIELD_KEYS[order];

  // The three boxes start empty (no default date). `dob` is derived: null until they read as a real, past date.
  const [parts, setParts] = useState<DateParts>(EMPTY_DATE);
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputs = useRef<Record<FieldKey, TextInput | null>>({ day: null, month: null, year: null });

  const parsed = useMemo(() => parseBirthDate(parts), [parts]);
  const dob = parsed.ok ? parsed.date : null;
  const allFilled = parts.day !== '' && parts.month !== '' && parts.year !== '';
  // Only once the three boxes have something: while typing, an unfinished date is not an error.
  const dateError = allFilled && !parsed.ok && parsed.reason !== 'incomplete' ? parsed.reason : null;

  const formatLong = useCallback(
    (d: Date) =>
      d.toLocaleDateString(i18n.language === 'es' ? 'es' : 'en', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    [i18n.language],
  );

  const focusField = useCallback((key: FieldKey | undefined) => {
    if (key) inputs.current[key]?.focus();
  }, []);

  const onChangeField = useCallback(
    (key: FieldKey, raw: string) => {
      const digits = raw.replace(/\D/g, '');
      if (digits.length > MAX_DIGITS[key]) {
        // More than the box takes: a pasted date. Spread it over the three boxes (the native maxLength is not used
        // on purpose: it would cut the pasted text before it reaches here).
        const pasted = splitPastedDate(raw, order);
        if (pasted) {
          setParts(pasted);
          focusField('year');
          return;
        }
        setParts((p) => ({ ...p, [key]: digits.slice(0, MAX_DIGITS[key]) }));
        return;
      }
      setParts((p) => ({ ...p, [key]: digits }));
      if (isFieldDone(key, digits)) focusField(keys[keys.indexOf(key) + 1]);
    },
    [focusField, keys, order],
  );

  // Backspace on an empty box goes back to the previous one.
  const onKeyPress = useCallback(
    (key: FieldKey, e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      if (e.nativeEvent.key === 'Backspace' && parts[key] === '') focusField(keys[keys.indexOf(key) - 1]);
    },
    [focusField, keys, parts],
  );

  const submit = useCallback(async () => {
    if (!dob) return;
    setBusy(true);
    const result = await confirmAge(dob);
    if (result === 'ok') {
      await refreshAge(); // gate opens when age_confirmed_at is read back
      setBusy(false);
      return;
    }
    if (result === 'underage') {
      // Existing delete-account flow, then sign out. Neutral message: no age stated.
      await deleteMyAccount();
      await signOut().catch(() => null);
      setBusy(false);
      showAlert(t('age.notEligibleTitle'), t('age.notEligibleMessage'));
      return;
    }
    setBusy(false);
    showAlert(t('age.errorTitle'), t('age.errorMessage'));
  }, [dob, refreshAge, signOut, t]);

  const onContinue = useCallback(() => {
    if (!dob || !terms || busy) return;
    void confirm(t('age.confirmTitle'), t('age.confirmMessage', { date: formatLong(dob) }), { confirmText: t('age.confirmYes'), cancelText: t('age.confirmEdit') }).then((accepted) => {
      if (!accepted) return;
      void submit();
    });
  }, [busy, dob, formatLong, submit, t, terms]);

  const frame = [
    styles.screen,
    { backgroundColor: c.bgBase, paddingTop: insets.top, paddingBottom: insets.bottom },
  ];

  // Still reading users.age_confirmed_at.
  if (ageStatus === 'loading') {
    return (
      <View style={[...frame, styles.centerFill]}>
        <Spinner color={c.brandText} />
      </View>
    );
  }

  // Fail closed: never let the user in when the status could not be read.
  if (ageStatus === 'error') {
    return (
      <View style={[...frame, styles.centerFill]}>
        <Text style={[styles.subtitle, { color: c.textSecondary }]}>{t('age.loadError')}</Text>
        <Pressable
          onPress={() => void refreshAge()}
          style={[styles.button, { backgroundColor: c.brandFill, marginTop: 20, alignSelf: 'stretch' }]}
          accessibilityRole="button"
          accessibilityLabel={t('age.retry')}
        >
          <Text style={styles.buttonLabel}>{t('age.retry')}</Text>
        </Pressable>
        <Pressable onPress={() => void signOut().catch(() => null)} style={styles.linkButton} accessibilityRole="button">
          <Text style={[styles.linkLabel, { color: c.textTertiary }]}>{t('age.signOut')}</Text>
        </Pressable>
      </View>
    );
  }

  const canContinue = parsed.ok && terms && !busy;
  const dateHint = t('age.dateHint', { format: keys.map((key) => t(`age.${key}Placeholder`)).join(' / ') });

  return (
    <View style={frame}>
      <StatusBar barStyle={c.bgBase === palette.bgBase ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: c.textPrimary }]}>{t('age.title')}</Text>
        <Text style={[styles.subtitle, { color: c.textSecondary }]}>{t('age.subtitle')}</Text>

        <View style={styles.dateBlock} role="group" accessibilityLabel={t('age.dateLabel')}>
          <Text style={[styles.label, { color: c.textSecondary }]}>{t('age.dateLabel')}</Text>
          <View style={styles.dateRow}>
            {keys.map((key, index) => {
              const isLast = index === keys.length - 1;
              return (
                <View key={key} style={{ flex: FIELD_FLEX[key] }}>
                  <Text style={[styles.boxLabel, { color: c.textSecondary }]}>{t(`age.${key}`)}</Text>
                  <TextInput
                    ref={(node) => {
                      inputs.current[key] = node;
                    }}
                    value={parts[key]}
                    onChangeText={(text) => onChangeField(key, text)}
                    onKeyPress={(e) => onKeyPress(key, e)}
                    onSubmitEditing={() => focusField(keys[index + 1])}
                    keyboardType="number-pad"
                    inputMode="numeric"
                    returnKeyType={isLast ? 'done' : 'next'}
                    textContentType="none"
                    autoComplete="off"
                    autoCorrect={false}
                    selectTextOnFocus
                    placeholder={t(`age.${key}Placeholder`)}
                    placeholderTextColor={c.textTertiary}
                    accessibilityLabel={t(`age.${key}`)}
                    accessibilityHint={dateHint}
                    style={[
                      styles.box,
                      {
                        backgroundColor: c.bgSurface,
                        borderColor: dateError ? c.danger : c.borderSubtle,
                        color: c.textPrimary,
                      },
                    ]}
                  />
                </View>
              );
            })}
          </View>
          {dateError && (
            <Text accessibilityRole="alert" style={[styles.errorText, { color: c.dangerText }]}>
              {dateError === 'future' ? t('age.dateFuture') : t('age.dateInvalid')}
            </Text>
          )}
        </View>

        <TouchableOpacity
          style={styles.termsRow}
          onPress={() => setTerms((v) => !v)}
          activeOpacity={0.75}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: terms }}
          accessibilityLabel={t('age.termsA11y')}
        >
          <View
            style={[
              styles.checkbox,
              {
                borderColor: terms ? palette.brand : LOCAL_COLORS.checkboxBorder,
                backgroundColor: terms ? palette.brandFill : 'transparent',
              },
            ]}
          >
            {terms && <IconCheck size={14} color={LOCAL_COLORS.onBrand} strokeWidth={2.5} />}
          </View>
          <View style={styles.termsTextWrap}>
            <Text style={[styles.termsText, { color: c.textSecondary }]}>{t('age.termsAgree')}</Text>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                void WebBrowser.openBrowserAsync(TERMS_URL);
              }}
              hitSlop={6}
            >
              <Text style={[styles.termsLink, { color: palette.brand }]}>{t('age.terms')}</Text>
            </TouchableOpacity>
            <Text style={[styles.termsText, { color: c.textSecondary }]}>{t('age.and')}</Text>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                void WebBrowser.openBrowserAsync(PRIVACY_URL);
              }}
              hitSlop={6}
            >
              <Text style={[styles.termsLink, { color: palette.brand }]}>{t('age.privacy')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>

        <Pressable
          onPress={onContinue}
          disabled={!canContinue}
          style={[styles.button, { backgroundColor: c.brandFill, opacity: canContinue ? 1 : 0.4, marginTop: 28 }]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canContinue }}
          accessibilityLabel={t('age.continue')}
        >
          {busy ? <Spinner color={LOCAL_COLORS.onBrand} /> : <Text style={styles.buttonLabel}>{t('age.continue')}</Text>}
        </Pressable>

        <Pressable onPress={() => void signOut().catch(() => null)} style={styles.linkButton} accessibilityRole="button">
          <Text style={[styles.linkLabel, { color: c.textTertiary }]}>{t('age.signOut')}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 24 },
  centerFill: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingTop: 48, paddingBottom: 24 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 28 },
  label: { fontSize: 13, fontWeight: '500', marginBottom: 10 },
  dateBlock: { marginBottom: 20 },
  dateRow: { flexDirection: 'row', gap: 10 },
  boxLabel: { fontSize: 12, fontWeight: '500', marginBottom: 6 },
  box: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 8,
    fontSize: 18,
    textAlign: 'center',
  },
  errorText: { fontSize: 13, lineHeight: 18, marginTop: 8 },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    flexShrink: 0,
  },
  termsTextWrap: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  termsText: { fontSize: 13, lineHeight: 20 },
  termsLink: { fontSize: 13, lineHeight: 20, fontWeight: '600', textDecorationLine: 'underline' },
  button: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  buttonLabel: { color: LOCAL_COLORS.onBrand, fontSize: 16, fontWeight: '600' },
  linkButton: { alignItems: 'center', paddingVertical: 16 },
  linkLabel: { fontSize: 14 },
});
