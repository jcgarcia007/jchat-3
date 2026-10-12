/**
 * JChat 3.0 — EntryVenueCard: "Vas a entrar a {negocio}" before the login.
 *
 * Shown on Welcome / Login / LoginEmail while a venue entry (QR or link) is pending. It only shows public data
 * (name, logo, table); the chat still needs the person signed in AND physically there (geofence gate).
 *   variant 'welcome' — full card on the fixed dark gradient (palette tokens).
 *   variant 'ticket'  — compact header on the login ticket paper (ticket tokens).
 * Not resolved → a discreet "No reconocimos este QR" line; the normal flow continues. Nothing pending → null.
 */

import React from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Trans, useTranslation } from 'react-i18next';

import { usePendingEntryPreview } from '../../hooks/usePendingEntryPreview';
import { palette } from '../../theme/tokens';
import { ticket } from '../../theme/ticket';

type Variant = 'welcome' | 'ticket';

const COLORS = {
  welcome: {
    surface: palette.bgElevated,
    border: palette.borderSubtle,
    text: palette.textPrimary,
    muted: palette.textSecondary,
    accent: palette.brand,
    logoBg: palette.brandLight,
  },
  ticket: {
    surface: ticket.ticketField,
    border: ticket.ticketFieldBorder,
    text: ticket.ticketInk,
    muted: ticket.ticketInkMuted,
    accent: ticket.brandAccent,
    logoBg: ticket.ticketPaper,
  },
} as const;

export function EntryVenueCard({ variant, style }: { variant: Variant; style?: StyleProp<ViewStyle> }): React.ReactElement | null {
  const { t } = useTranslation('chat');
  const preview = usePendingEntryPreview();
  const c = COLORS[variant];
  const compact = variant === 'ticket';

  if (preview.status === 'none') return null;

  if (preview.status === 'unrecognized') {
    return (
      <View
        testID="entry-card-unrecognized"
        accessible
        accessibilityRole="text"
        style={[styles.unrecognized, { borderColor: c.border }, style]}
      >
        <Text style={[styles.unrecognizedText, { color: c.muted }]}>{t('entry.notRecognized')}</Text>
      </View>
    );
  }

  const { entry } = preview;
  const plainName = t('entry.goingTo', { name: entry.businessName }).replace(/<\/?b>/g, '');
  const tableText = entry.tableLabel ? t('entry.table', { label: entry.tableLabel }) : null;
  const logoSize = compact ? 36 : 52;

  return (
    <View
      testID="entry-card"
      accessible
      accessibilityRole="summary"
      accessibilityLabel={[plainName, tableText, compact ? null : t('entry.signInToEnter')].filter(Boolean).join('. ')}
      style={[styles.card, compact && styles.cardCompact, { backgroundColor: c.surface, borderColor: c.border }, style]}
    >
      <View style={styles.row}>
        <View style={[styles.logo, { width: logoSize, height: logoSize, borderRadius: logoSize / 4, backgroundColor: c.logoBg }]}>
          {entry.logoUrl ? (
            <Image source={{ uri: entry.logoUrl }} style={{ width: logoSize, height: logoSize, borderRadius: logoSize / 4 }} />
          ) : (
            <Text style={[styles.initial, { color: c.accent, fontSize: logoSize * 0.46 }]}>
              {entry.businessName.trim().charAt(0).toUpperCase()}
            </Text>
          )}
        </View>
        <View style={styles.texts}>
          <Text style={[styles.goingTo, { color: c.text }]} numberOfLines={2}>
            <Trans
              t={t}
              i18nKey="entry.goingTo"
              values={{ name: entry.businessName }}
              components={{ b: <Text style={styles.bold} /> }}
            />
          </Text>
          {tableText ? <Text style={[styles.table, { color: c.muted }]}>{tableText}</Text> : null}
        </View>
      </View>
      {compact ? null : <Text style={[styles.hint, { color: c.muted }]}>{t('entry.signInToEnter')}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { alignSelf: 'stretch', borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  cardCompact: { padding: 10, borderRadius: 12, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  initial: { fontWeight: '800' },
  texts: { flex: 1, gap: 2 },
  goingTo: { fontSize: 16, lineHeight: 22 },
  bold: { fontWeight: '800' },
  table: { fontSize: 14 },
  hint: { fontSize: 14, lineHeight: 20 },
  unrecognized: { alignSelf: 'center', borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  unrecognizedText: { fontSize: 13 },
});
