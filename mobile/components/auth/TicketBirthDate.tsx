/**
 * Date of birth in three numeric boxes (Day / Month / Year, month first in English) for the "boleto" register screen.
 * Same behaviour as the age gate (screens/auth/ConfirmAgeScreen.tsx): utils/birthDate.ts decides the order, spreads a
 * pasted date over the boxes and says whether it reads as a real date; here the boxes only move the cursor
 * (a finished box jumps to the next, Backspace on an empty box goes back) and show the error text.
 * The caller owns `parts`; it turns them into a Date with parseBirthDate.
 */

import React, { useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { ticket } from '../../theme/ticket';
import { loginFont } from '../../theme/loginFonts';
import { fieldOrder, splitPastedDate, type DateParts, type FieldOrder } from '../../utils/birthDate';

type FieldKey = keyof DateParts;

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

export interface TicketBirthDateProps {
  parts: DateParts;
  onChangeParts: (parts: DateParts) => void;
  /** Already translated error under the boxes; null for none. */
  error: string | null;
}

export function TicketBirthDate({ parts, onChangeParts, error }: TicketBirthDateProps) {
  const { t, i18n } = useTranslation('auth');
  const order = fieldOrder(i18n.language);
  const keys = FIELD_KEYS[order];
  const inputs = useRef<Record<FieldKey, TextInput | null>>({ day: null, month: null, year: null });
  const dateHint = t('age.dateHint', { format: keys.map((key) => t(`age.${key}Placeholder`)).join(' / ') });

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
          onChangeParts(pasted);
          focusField('year');
          return;
        }
        onChangeParts({ ...parts, [key]: digits.slice(0, MAX_DIGITS[key]) });
        return;
      }
      onChangeParts({ ...parts, [key]: digits });
      if (isFieldDone(key, digits)) focusField(keys[keys.indexOf(key) + 1]);
    },
    [focusField, keys, onChangeParts, order, parts],
  );

  // Backspace on an empty box goes back to the previous one.
  const onKeyPress = useCallback(
    (key: FieldKey, e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      if (e.nativeEvent.key === 'Backspace' && parts[key] === '') focusField(keys[keys.indexOf(key) - 1]);
    },
    [focusField, keys, parts],
  );

  return (
    <View style={styles.block} role="group" accessibilityLabel={t('register.dobLabel')}>
      <Text style={styles.label}>{t('register.dobLabel')}</Text>
      <View style={styles.row}>
        {keys.map((key, index) => {
          const isLast = index === keys.length - 1;
          return (
            <View key={key} style={{ flex: FIELD_FLEX[key] }}>
              <Text style={styles.boxLabel}>{t(`age.${key}`)}</Text>
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
                placeholderTextColor={ticket.ticketInkMuted}
                accessibilityLabel={t(`age.${key}`)}
                accessibilityHint={dateHint}
                style={[styles.box, error ? styles.boxError : null]}
              />
            </View>
          );
        })}
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: 18 },
  label: {
    marginBottom: 6,
    fontFamily: loginFont.mono,
    fontSize: 11,
    letterSpacing: 1.6,
    color: ticket.ticketInkMuted,
    textTransform: 'uppercase',
  },
  row: { flexDirection: 'row', gap: 10 },
  boxLabel: { marginBottom: 4, fontFamily: loginFont.text, fontSize: 12, color: ticket.ticketInkMuted },
  box: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ticket.ticketFieldBorder,
    backgroundColor: ticket.ticketField,
    textAlign: 'center',
    fontFamily: loginFont.textBold,
    fontSize: 18,
    color: ticket.ticketInk,
  },
  boxError: { borderColor: ticket.ticketError },
  error: { marginTop: 6, fontFamily: loginFont.text, fontSize: 12, color: ticket.ticketError },
});
