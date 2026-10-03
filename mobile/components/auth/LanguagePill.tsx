/**
 * ES · EN selector shown over the login photo. Switches the app language immediately, stores the
 * choice locally and (on the first sign-in) AuthContext saves it to the account.
 */

import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ticket } from '../../theme/ticket';
import { loginFont } from '../../theme/loginFonts';
import { changeAppLanguage } from '../../i18n';
import { setLanguageChoice, type LanguageChoice } from '../../services/languageChoice';

const OPTIONS: ReadonlyArray<{ code: LanguageChoice; label: string; a11yKey: string }> = [
  { code: 'es', label: 'ES', a11yKey: 'ticket.languageEs' },
  { code: 'en', label: 'EN', a11yKey: 'ticket.languageEn' },
];

export function LanguagePill() {
  const { t, i18n } = useTranslation('auth');
  const current = i18n.language === 'es' ? 'es' : 'en';

  const choose = useCallback((code: LanguageChoice) => {
    changeAppLanguage(code);
    void setLanguageChoice(code);
  }, []);

  return (
    <View
      style={styles.pill}
      accessibilityRole="radiogroup"
      accessibilityLabel={t('ticket.languageGroup')}
    >
      {OPTIONS.map((option) => {
        const active = option.code === current;
        return (
          <Pressable
            key={option.code}
            onPress={() => choose(option.code)}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            style={[styles.option, active && styles.optionActive]}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={t(option.a11yKey)}
          >
            <Text style={[styles.optionText, active && styles.optionTextActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ticket.ticketPillBorder,
    backgroundColor: ticket.ticketPillBg,
  },
  option: {
    minWidth: 44,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionActive: { backgroundColor: ticket.ticketPillActiveBg },
  optionText: {
    fontFamily: loginFont.mono,
    fontSize: 12,
    letterSpacing: 1,
    color: ticket.ticketPillText,
  },
  optionTextActive: { color: ticket.ticketPillActiveText },
});
