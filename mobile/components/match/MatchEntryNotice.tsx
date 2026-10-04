/**
 * JChat 3.0 — Match entry notice (Fase D1)
 *
 * Block shown inside the chat's pre-entry sheet when Match is enabled at the venue.
 *  - FIRST time at a venue (full): 4 key points, switches, safety guide box (scroll) and legal links.
 *  - Later visits (short): the switches + a "See safety guide" toggle.
 * Switches: global "Take part in games" (users.settings.gamesEnabled) + one per catalog game
 * (today only Match). Turning the venue switch off leaves the venue on entry (match_leave_venue).
 * Presentational: state and persistence live in ChatRoomScreen.
 */

import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconCamera, IconEye, IconLifebuoy, IconTrash } from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import type { GameRow } from '../../services/match';

const TERMS_URL = 'https://jchat.cloud/terms';
const PRIVACY_URL = 'https://jchat.cloud/privacy';

/** Safety guide: section key → number of bullet items (texts in match.json entry.guide). */
const GUIDE_SECTIONS = [
  { key: 'visible', count: 2 },
  { key: 'erased', count: 3 },
  { key: 'care', count: 4 },
  { key: 'wrong', count: 3 },
  { key: 'data', count: 2 },
] as const;

interface MatchEntryNoticeProps {
  businessName: string;
  /** First time at this venue → full notice. */
  full: boolean;
  games: GameRow[];
  gamesEnabled: boolean;
  onGamesEnabledChange: (value: boolean) => void;
  /** Per-venue "Match" switch. */
  matchOptIn: boolean;
  onMatchOptInChange: (value: boolean) => void;
  language: 'en' | 'es';
}

interface SwitchRowProps {
  label: string;
  hint?: string;
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}

function SwitchRow({ label, hint, value, disabled, onChange }: SwitchRowProps) {
  const c = useThemeColors();
  return (
    <Pressable
      onPress={() => !disabled && onChange(!value)}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      style={[styles.switchRow, { opacity: disabled ? 0.5 : 1 }]}
    >
      <View style={styles.switchTexts}>
        <Text style={[styles.switchLabel, { color: c.textPrimary }]}>{label}</Text>
        {hint ? <Text style={[styles.switchHint, { color: c.textSecondary }]}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ false: c.borderSubtle, true: c.brand }}
        thumbColor={palette.onBrand}
        accessible={false}
      />
    </Pressable>
  );
}

export function MatchEntryNotice({
  businessName,
  full,
  games,
  gamesEnabled,
  onGamesEnabledChange,
  matchOptIn,
  onMatchOptInChange,
  language,
}: MatchEntryNoticeProps) {
  const c = useThemeColors();
  const { t } = useTranslation('match');
  const [guideOpen, setGuideOpen] = useState(full);

  const points: { key: 'here' | 'erased' | 'screenshots' | 'help'; Icon: typeof IconEye }[] = [
    { key: 'here', Icon: IconEye },
    { key: 'erased', Icon: IconTrash },
    { key: 'screenshots', Icon: IconCamera },
    { key: 'help', Icon: IconLifebuoy },
  ];

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
    >
      <Text style={[styles.title, { color: c.textPrimary }]} accessibilityRole="header">
        {full ? t('entry.title') : t('entry.shortTitle', { business: businessName })}
      </Text>

      {/* Key points: always visible */}
      <View style={styles.points}>
        {points.map(({ key, Icon }) => (
          <View key={key} style={styles.pointRow}>
            <Icon size={20} color={c.brand} />
            <View style={styles.pointTexts}>
              <Text style={[styles.pointTitle, { color: c.textPrimary }]}>{t(`entry.points.${key}.title`)}</Text>
              <Text style={[styles.pointText, { color: c.textSecondary }]}>{t(`entry.points.${key}.body`)}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Switches: global + one per catalog game */}
      <View style={[styles.switchBlock, { borderColor: c.borderSubtle, backgroundColor: c.bgElevated }]}>
        <SwitchRow
          label={t('entry.gamesGlobal')}
          hint={t('entry.gamesGlobalHint')}
          value={gamesEnabled}
          onChange={onGamesEnabledChange}
        />
        {games.map((game) => {
          const name = language === 'es' ? game.name_es : game.name_en;
          const isMatch = game.key === 'match';
          return (
            <SwitchRow
              key={game.key}
              label={name}
              hint={t('entry.gameSwitchHint', { game: name })}
              value={isMatch ? matchOptIn && gamesEnabled : false}
              disabled={!gamesEnabled || !isMatch}
              onChange={isMatch ? onMatchOptInChange : () => undefined}
            />
          );
        })}
      </View>

      {/* Safety guide */}
      {!full && (
        <Pressable
          onPress={() => setGuideOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: guideOpen }}
          style={styles.guideToggle}
        >
          <Text style={[styles.guideToggleText, { color: c.brand }]}>
            {guideOpen ? t('entry.hideGuide') : t('entry.seeGuide')}
          </Text>
        </Pressable>
      )}
      {guideOpen && (
        <View style={[styles.guideBox, { borderColor: c.borderSubtle, backgroundColor: c.bgElevated }]}>
          <Text style={[styles.guideTitle, { color: c.textPrimary }]}>{t('entry.guideTitle')}</Text>
          <ScrollView nestedScrollEnabled style={styles.guideScroll} showsVerticalScrollIndicator>
            {GUIDE_SECTIONS.map(({ key, count }) => (
              <View key={key} style={styles.guideSection}>
                <Text style={[styles.guideSectionTitle, { color: c.textPrimary }]}>
                  {t(`entry.guide.${key}.title`)}
                </Text>
                {Array.from({ length: count }, (_, i) => `i${i + 1}`).map((item) => (
                  <Text
                    key={item}
                    style={[styles.guideSectionBody, { color: c.textSecondary }]}
                    accessibilityRole={key === 'data' && item === 'i2' ? 'link' : undefined}
                    onPress={key === 'data' && item === 'i2' ? () => void Linking.openURL(PRIVACY_URL) : undefined}
                  >
                    {'• '}
                    {t(`entry.guide.${key}.${item}`)}
                  </Text>
                ))}
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      <Text style={[styles.legal, { color: c.textSecondary }]}>
        {t('entry.legalPrefix')}{' '}
        <Text
          style={{ color: c.brand }}
          accessibilityRole="link"
          onPress={() => void Linking.openURL(TERMS_URL)}
        >
          {t('entry.terms')}
        </Text>{' '}
        {t('entry.legalAnd')}{' '}
        <Text
          style={{ color: c.brand }}
          accessibilityRole="link"
          onPress={() => void Linking.openURL(PRIVACY_URL)}
        >
          {t('entry.privacy')}
        </Text>
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexShrink: 1 },
  content: { gap: 14, paddingBottom: 4 },
  title: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  points: { gap: 10 },
  pointRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  pointTexts: { flex: 1, gap: 1 },
  pointTitle: { fontSize: 14, fontWeight: '700' },
  pointText: { fontSize: 13, lineHeight: 18 },
  switchBlock: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingVertical: 8,
  },
  switchTexts: { flex: 1, gap: 2 },
  switchLabel: { fontSize: 15, fontWeight: '600' },
  switchHint: { fontSize: 12, lineHeight: 16 },
  guideToggle: { alignSelf: 'center', minHeight: 44, justifyContent: 'center' },
  guideToggleText: { fontSize: 14, fontWeight: '600' },
  guideBox: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
  guideTitle: { fontSize: 14, fontWeight: '700' },
  guideScroll: { maxHeight: 160 },
  guideSection: { marginBottom: 10 },
  guideSectionTitle: { fontSize: 13, fontWeight: '700' },
  guideSectionBody: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  legal: { fontSize: 12, lineHeight: 17, textAlign: 'center' },
});
