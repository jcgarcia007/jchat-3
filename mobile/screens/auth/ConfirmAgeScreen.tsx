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
import FormField from '../../components/common/FormField';
import { controlMinHeight, fieldLabelGap, sectionGap, space } from '../../theme/spacing';
import { typeCap, typeStyle } from '../../theme/typography';
import AppText from '../../components/common/AppText';
import { useAuth } from '../../context/AuthContext';
import { confirmAge } from '../../services/age';
import { recordAgeRejection } from '../../services/ageRejection';
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
      await recordAgeRejection(); // B2-13: this device can not reopen the sign-up for 24 h
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
        <AppText variant="body" color={c.textSecondary} style={styles.subtitle}>
          {t('age.loadError')}
        </AppText>
        <Pressable
          onPress={() => void refreshAge()}
          style={[styles.button, { backgroundColor: c.brandFill, marginTop: space.xl, alignSelf: 'stretch' }]}
          accessibilityRole="button"
          accessibilityLabel={t('age.retry')}
        >
          <AppText variant="button" color={LOCAL_COLORS.onBrand} style={styles.buttonLabel}>
            {t('age.retry')}
          </AppText>
        </Pressable>
        <Pressable onPress={() => void signOut().catch(() => null)} style={styles.linkButton} accessibilityRole="button">
          <AppText variant="body" color={c.textTertiary}>
            {t('age.signOut')}
          </AppText>
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
        <AppText variant="title" color={c.textPrimary} style={styles.title}>
          {t('age.title')}
        </AppText>
        <AppText variant="body" color={c.textSecondary} style={styles.subtitle}>
          {t('age.subtitle')}
        </AppText>

        <View style={styles.dateBlock} role="group" accessibilityLabel={t('age.dateLabel')}>
          <AppText variant="label" color={c.textSecondary} style={styles.label}>
            {t('age.dateLabel')}
          </AppText>
          <View style={styles.dateRow}>
            {keys.map((key, index) => {
              const isLast = index === keys.length - 1;
              return (
                <FormField
                  key={key}
                  first
                  containerStyle={{ flex: FIELD_FLEX[key] }}
                  label={t(`age.${key}`)}
                  palette={{
                    background: c.bgSurface,
                    border: dateError ? c.danger : c.borderSubtle,
                    label: c.textSecondary,
                    text: c.textPrimary,
                    placeholder: c.textTertiary,
                  }}
                  style={styles.box}
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
                  accessibilityHint={dateHint}
                />
              );
            })}
          </View>
          {dateError && (
            <AppText accessibilityRole="alert" variant="caption" color={c.dangerText} style={styles.errorText}>
              {dateError === 'future' ? t('age.dateFuture') : t('age.dateInvalid')}
            </AppText>
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
            <AppText variant="caption" color={c.textSecondary}>
              {t('age.termsAgree')}
            </AppText>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                void WebBrowser.openBrowserAsync(TERMS_URL);
              }}
              hitSlop={6}
            >
              <AppText variant="caption" color={palette.brand} style={styles.termsLink}>
                {t('age.terms')}
              </AppText>
            </TouchableOpacity>
            <AppText variant="caption" color={c.textSecondary}>
              {t('age.and')}
            </AppText>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                void WebBrowser.openBrowserAsync(PRIVACY_URL);
              }}
              hitSlop={6}
            >
              <AppText variant="caption" color={palette.brand} style={styles.termsLink}>
                {t('age.privacy')}
              </AppText>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>

        <Pressable
          onPress={onContinue}
          disabled={!canContinue}
          style={[styles.button, { backgroundColor: c.brandFill, opacity: canContinue ? 1 : 0.4, marginTop: space.xxl }]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canContinue }}
          accessibilityLabel={t('age.continue')}
        >
          {busy ? (
            <Spinner color={LOCAL_COLORS.onBrand} />
          ) : (
            <AppText variant="button" color={LOCAL_COLORS.onBrand} style={styles.buttonLabel}>
              {t('age.continue')}
            </AppText>
          )}
        </Pressable>

        <Pressable onPress={() => void signOut().catch(() => null)} style={styles.linkButton} accessibilityRole="button">
          <AppText variant="body" color={c.textTertiary}>
            {t('age.signOut')}
          </AppText>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: space.xl },
  centerFill: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingTop: 48, paddingBottom: space.xl },
  title: { fontWeight: '700', marginBottom: space.sm },
  subtitle: { marginBottom: sectionGap },
  label: { fontWeight: '500', marginBottom: space.sm },
  dateBlock: { marginBottom: space.xl },
  dateRow: { flexDirection: 'row', gap: space.sm },
  box: { paddingHorizontal: space.sm, textAlign: 'center' },
  errorText: { marginTop: space.sm },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  termsTextWrap: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  termsLink: { fontWeight: '600', textDecorationLine: 'underline' },
  button: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  buttonLabel: { fontWeight: '600' },
  linkButton: { alignItems: 'center', justifyContent: 'center', minHeight: controlMinHeight, paddingVertical: space.lg },
});
