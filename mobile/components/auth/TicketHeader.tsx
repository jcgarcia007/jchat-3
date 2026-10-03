/** Top row of the ticket: JChat logo ("J" in indigo + star) and the mono label "JCH / LOCAL / 01". */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconStarFilled } from '@tabler/icons-react-native';

import { ticket } from '../../theme/ticket';
import { loginFont } from '../../theme/loginFonts';

export function TicketHeader() {
  const { t } = useTranslation('auth');
  return (
    <View style={styles.row}>
      <View style={styles.logo} accessible accessibilityRole="image" accessibilityLabel="JChat">
        <Text style={styles.logoJ}>J</Text>
        <IconStarFilled size={12} color={ticket.brandAccent} style={styles.star} />
        <Text style={styles.wordmark}>JChat</Text>
      </View>
      <Text style={styles.label} accessibilityElementsHidden importantForAccessibility="no">
        {t('ticket.label')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  logo: { flexDirection: 'row', alignItems: 'center' },
  logoJ: { fontFamily: loginFont.title, fontSize: 30, lineHeight: 34, color: ticket.brandAccent },
  star: { marginLeft: 1, marginTop: -10 },
  wordmark: { marginLeft: 6, fontFamily: loginFont.textBold, fontSize: 16, color: ticket.ticketInk },
  label: { fontFamily: loginFont.mono, fontSize: 11, letterSpacing: 1.6, color: ticket.ticketInkMuted },
});
