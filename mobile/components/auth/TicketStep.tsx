/**
 * Step indicator of the "boleto" register screens: two bars (filled up to the current step) and the mono
 * label "STEP 1 OF 2" / "PASO 2 DE 2". It is one accessible element: a progress bar whose name is the label.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ticket } from '../../theme/ticket';
import { loginFont } from '../../theme/loginFonts';

const TOTAL_STEPS = 2;

export function TicketStep({ step }: { step: 1 | 2 }) {
  const { t } = useTranslation('auth');
  const label = t(`register.step${step}Indicator`);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 1, max: TOTAL_STEPS, now: step }}
      style={styles.row}
    >
      <View style={styles.bars}>
        {Array.from({ length: TOTAL_STEPS }, (_, index) => (
          <View key={index} style={[styles.bar, index < step && styles.barOn]} />
        ))}
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  bars: { flexDirection: 'row', gap: 4 },
  bar: { width: 22, height: 4, borderRadius: 2, backgroundColor: ticket.ticketPerforation },
  barOn: { backgroundColor: ticket.brandAccent },
  label: { fontFamily: loginFont.mono, fontSize: 11, letterSpacing: 1.6, color: ticket.ticketInkMuted, textTransform: 'uppercase' },
});
