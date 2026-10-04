/**
 * JChat 3.0 — Age gate (compliance P3).
 *
 * Rendered by AppNavigator in place of the main app while the signed-in user has
 * no server-side age confirmation (users.age_confirmed_at is null) — email,
 * Google, Apple and pre-existing accounts alike.
 *
 *  - Date picker with NO default: the field stays empty until the user picks.
 *  - Mandatory Terms/Privacy checkbox; Continue enabled only with both.
 *  - Asks "is your date of birth …?" and then calls rpc confirm_age. The full
 *    date is never stored client-side; the server keeps only the year.
 *  - Underage → neutral message (never states the required age), account deleted
 *    through the existing delete-account flow, then sign out.
 *  - Could not read the status → fail closed with "Retry".
 */

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import * as WebBrowser from 'expo-web-browser';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { IconCalendar, IconCheck } from '@tabler/icons-react-native';

import { palette } from '../../theme/tokens';
import { useThemeColors } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import { confirmAge, pickerMaxDate } from '../../services/age';
import { deleteMyAccount } from '../../services/account';

const TERMS_URL = 'https://jchat.cloud/terms';
const PRIVACY_URL = 'https://jchat.cloud/privacy';

const LOCAL_COLORS = {
  onBrand: palette.onBrand,
  checkboxBorder: palette.neutralBorder,
} as const;

export default function ConfirmAgeScreen() {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation('auth');
  const { ageStatus, refreshAge, signOut } = useAuth();

  // `dob` stays null until the user picks a date (no default value).
  const [dob, setDob] = useState<Date | null>(null);
  const [pickerValue, setPickerValue] = useState<Date>(pickerMaxDate);
  const [showPicker, setShowPicker] = useState(false);
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);

  const formatLong = useCallback(
    (d: Date) =>
      d.toLocaleDateString(i18n.language === 'es' ? 'es' : 'en', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    [i18n.language],
  );

  const onPickerChange = useCallback((event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setShowPicker(false);
    if (event.type === 'set' && selected) {
      setPickerValue(selected);
      if (Platform.OS === 'android') setDob(selected);
    }
  }, []);

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
      Alert.alert(t('age.notEligibleTitle'), t('age.notEligibleMessage'));
      return;
    }
    setBusy(false);
    Alert.alert(t('age.errorTitle'), t('age.errorMessage'));
  }, [dob, refreshAge, signOut, t]);

  const onContinue = useCallback(() => {
    if (!dob || !terms || busy) return;
    Alert.alert(
      t('age.confirmTitle'),
      t('age.confirmMessage', { date: formatLong(dob) }),
      [
        { text: t('age.confirmEdit'), style: 'cancel' },
        { text: t('age.confirmYes'), onPress: () => void submit() },
      ],
    );
  }, [busy, dob, formatLong, submit, t, terms]);

  const frame = [
    styles.screen,
    { backgroundColor: c.bgBase, paddingTop: insets.top, paddingBottom: insets.bottom },
  ];

  // Still reading users.age_confirmed_at.
  if (ageStatus === 'loading') {
    return (
      <View style={[...frame, styles.centerFill]}>
        <ActivityIndicator color={c.brand} />
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
          style={[styles.button, { backgroundColor: c.brand, marginTop: 20, alignSelf: 'stretch' }]}
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

  const canContinue = !!dob && terms && !busy;

  return (
    <View style={frame}>
      <StatusBar barStyle={c.bgBase === palette.bgBase ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: c.textPrimary }]}>{t('age.title')}</Text>
        <Text style={[styles.subtitle, { color: c.textSecondary }]}>{t('age.subtitle')}</Text>

        <Text style={[styles.label, { color: c.textSecondary }]}>{t('age.dateLabel')}</Text>
        <TouchableOpacity
          style={[styles.input, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}
          onPress={() => setShowPicker(true)}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={t('age.dateA11y')}
        >
          <IconCalendar size={18} color={c.textTertiary} strokeWidth={1.75} />
          <Text style={[styles.inputText, { color: dob ? c.textPrimary : c.textTertiary }]}>
            {dob ? formatLong(dob) : t('age.datePlaceholder')}
          </Text>
        </TouchableOpacity>

        {showPicker && Platform.OS === 'ios' && (
          <View style={[styles.iosPickerWrap, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
            <DateTimePicker
              value={pickerValue}
              mode="date"
              display="spinner"
              maximumDate={pickerMaxDate()}
              onChange={onPickerChange}
              textColor={c.textPrimary}
            />
            <TouchableOpacity
              style={[styles.iosDone, { borderTopColor: c.borderSubtle }]}
              onPress={() => {
                setDob(pickerValue);
                setShowPicker(false);
              }}
            >
              <Text style={[styles.iosDoneText, { color: palette.brand }]}>{t('age.dateDone')}</Text>
            </TouchableOpacity>
          </View>
        )}
        {showPicker && Platform.OS === 'android' && (
          <DateTimePicker
            value={pickerValue}
            mode="date"
            display="default"
            maximumDate={pickerMaxDate()}
            onChange={onPickerChange}
          />
        )}

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
                backgroundColor: terms ? palette.brand : 'transparent',
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
          style={[styles.button, { backgroundColor: c.brand, opacity: canContinue ? 1 : 0.4, marginTop: 28 }]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canContinue }}
          accessibilityLabel={t('age.continue')}
        >
          {busy ? <ActivityIndicator color={LOCAL_COLORS.onBrand} /> : <Text style={styles.buttonLabel}>{t('age.continue')}</Text>}
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
  label: { fontSize: 13, fontWeight: '500', marginBottom: 6 },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  inputText: { fontSize: 15, marginLeft: 8, flex: 1 },
  iosPickerWrap: { borderRadius: 12, borderWidth: 1, overflow: 'hidden', marginTop: -8, marginBottom: 20 },
  iosDone: { borderTopWidth: 1, paddingVertical: 12, alignItems: 'center' },
  iosDoneText: { fontSize: 16, fontWeight: '600' },
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
