/**
 * JChat 3.0 — games entry notice (Fase D1, Match v2)
 *
 * Block shown inside the chat's pre-entry sheet when the venue has ANY game on (Match and/or Truth or Dare).
 *  - FIRST time at a venue (full): 6 key points, the switch, safety guide box (scroll) and legal links.
 *  - Later visits (short): the switch + a "See safety guide" toggle.
 * ONE switch: "Take part in games" (users.settings.gamesEnabled), for Match and Truth or Dare at every venue; it can also be changed in Settings.
 * Turning it off leaves the venue's Match on entry (match_leave_venue).
 * The ES / EN selector (top-right of the venue-name row, in ChatRoomScreen) changes ONLY the texts of the sheet; this block receives its language.
 * Presentational: state and persistence live in ChatRoomScreen.
 */

import React, { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconBan, IconCamera, IconEye, IconLifebuoy, IconShieldCheck, IconTrash } from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { ThemedSwitch } from '../common/ThemedSwitch';

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

/** The six key points, in order, each with its icon (texts in match.json entry.points). */
const POINTS = [
  { key: 'here', Icon: IconEye },
  { key: 'adults', Icon: IconShieldCheck },
  { key: 'erased', Icon: IconTrash },
  { key: 'block', Icon: IconBan },
  { key: 'screenshots', Icon: IconCamera },
  { key: 'help', Icon: IconLifebuoy },
] as const;

type SheetLanguage = 'en' | 'es';

interface MatchEntryNoticeProps {
  businessName: string;
  /** First time at this venue → full notice. */
  full: boolean;
  gamesEnabled: boolean;
  onGamesEnabledChange: (value: boolean) => void;
  /** The sheet's language (chosen with the selector; starts as the app's language). */
  language: SheetLanguage;
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
    // ONE control per row: the Switch (role switch, label, hint, checked). The row only widens the tap target for
    // sighted users (accessible={false}: it is not a second control for screen readers / axe — no nested controls).
    <Pressable
      onPress={() => !disabled && onChange(!value)}
      accessible={false}
      style={styles.switchRow}
    >
      <View style={styles.switchTexts}>
        {/* Disabled = the dimmer textTertiary (still >= 4.5:1), not opacity 0.5, which dropped it to ~2.5:1. */}
        <Text style={[styles.switchLabel, { color: disabled ? c.textTertiary : c.textPrimary }]}>{label}</Text>
        {hint ? <Text style={[styles.switchHint, { color: disabled ? c.textTertiary : c.textSecondary }]}>{hint}</Text> : null}
      </View>
      <ThemedSwitch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ false: c.borderSubtle, true: c.brand }}
        accessibilityLabel={label}
        accessibilityHint={hint}
      />
    </Pressable>
  );
}

/** ES | EN selector: two small buttons, the active one filled. */
export function LanguageSelector({ value, onChange, label }: { value: SheetLanguage; onChange: (next: SheetLanguage) => void; label: string }) {
  const c = useThemeColors();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.langBox, { borderColor: c.borderSubtle }]}>
      {(['es', 'en'] as const).map((code) => {
        const active = code === value;
        return (
          <Pressable
            key={code}
            testID={`entry-lang-${code}`}
            onPress={() => onChange(code)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={code === 'es' ? 'Español' : 'English'}
                        style={[styles.langBtn, active && { backgroundColor: c.brandFill }]}
          >
            <Text style={[styles.langText, { color: active ? palette.onBrand : c.textSecondary }]}>{code.toUpperCase()}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function MatchEntryNotice({ businessName, full, gamesEnabled, onGamesEnabledChange, language }: MatchEntryNoticeProps) {
  const c = useThemeColors();
  const { i18n } = useTranslation();
  // Fixed to the sheet's language (chosen by the selector in ChatRoomScreen's title row): never touches i18n.language.
  const t = useMemo(() => i18n.getFixedT(language, 'match'), [i18n, language]);
  const [guideOpen, setGuideOpen] = useState(full);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
    >
      <Text style={[styles.title, { color: c.textPrimary }]} accessibilityRole="header" numberOfLines={2}>
        {full ? t('entry.title') : t('entry.shortTitle', { business: businessName })}
      </Text>

      {/* The one switch: Match and Truth or Dare */}
      <View style={[styles.switchBlock, { borderColor: c.borderSubtle, backgroundColor: c.bgElevated }]}>
        <SwitchRow
          label={t('entry.gamesGlobal')}
          hint={t('entry.gamesGlobalHint')}
          value={gamesEnabled}
          onChange={onGamesEnabledChange}
        />
      </View>

      {/* Key points: always visible */}
      <View style={styles.points}>
        {POINTS.map(({ key, Icon }) => (
          <View key={key} style={styles.pointRow}>
            <Icon size={20} color={c.brandText} />
            <View style={styles.pointTexts}>
              <Text style={[styles.pointTitle, { color: c.textPrimary }]}>{t(`entry.points.${key}.title`)}</Text>
              <Text style={[styles.pointText, { color: c.textSecondary }]}>{t(`entry.points.${key}.body`)}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Safety guide */}
      {!full && (
        <Pressable
          onPress={() => setGuideOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: guideOpen }}
          style={styles.guideToggle}
        >
          <Text style={[styles.guideToggleText, { color: c.brandText }]}>
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
                    style={[styles.guideSectionBody, { color: c.textSecondary }, key === 'data' && item === 'i2' ? { textDecorationLine: 'underline' } : null]}
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
          style={{ color: c.brandText, textDecorationLine: 'underline' }}
          accessibilityRole="link"
          onPress={() => void Linking.openURL(TERMS_URL)}
        >
          {t('entry.terms')}
        </Text>{' '}
        {t('entry.legalAnd')}{' '}
        <Text
          style={{ color: c.brandText, textDecorationLine: 'underline' }}
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
  title: { fontSize: 17, fontWeight: '700' },
  langBox: { flexDirection: 'row', borderWidth: 1, borderRadius: 999, overflow: 'hidden' },
  langBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  langText: { fontSize: 12, fontWeight: '800' },
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
