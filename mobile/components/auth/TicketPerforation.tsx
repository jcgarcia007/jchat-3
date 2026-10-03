/**
 * Dotted perforation line of the ticket with a round notch on each side. The notches use the
 * screen background color, so they read as bites taken out of the paper.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { ticket } from '../../theme/ticket';
import { TICKET_PADDING } from './ticketLayout';

const NOTCH = 24;

export function TicketPerforation() {
  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.notch, styles.notchLeft]} />
      <Svg height={2} width="100%">
        <Line
          x1="0"
          y1="1"
          x2="100%"
          y2="1"
          stroke={ticket.ticketPerforation}
          strokeWidth={2}
          strokeDasharray="2 7"
          strokeLinecap="round"
        />
      </Svg>
      <View style={[styles.notch, styles.notchRight]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { height: NOTCH, justifyContent: 'center', marginVertical: 14 },
  notch: {
    position: 'absolute',
    width: NOTCH,
    height: NOTCH,
    borderRadius: NOTCH / 2,
    backgroundColor: ticket.ticketBg,
  },
  notchLeft: { left: -(TICKET_PADDING + NOTCH / 2) },
  notchRight: { right: -(TICKET_PADDING + NOTCH / 2) },
});
