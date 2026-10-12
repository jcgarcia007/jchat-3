/**
 * JChat 3.0 — Truth or Dare: first-time welcome (rules + accept), 3-step tutorial (once) and the ⓘ rules.
 *
 * `useTodOnboarding()` gives screens one call, `ensure()`: it resolves true when the user already accepted the rules
 * (tod_terms has their row) or accepts them now (tod_accept_terms), and false if they dismiss the welcome. Right after the
 * first acceptance the tutorial plays once (local flag). `showRules()` reopens the rules read-only (the ⓘ icon).
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppModal } from '../common/AppModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { IconBan, IconEye, IconFlag, IconHandClick, IconHandStop, IconMessageCircle } from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { acceptTodTerms, hasAcceptedTodTerms, hasSeenTodTutorial, markTodTutorialSeen } from '../../services/tod';

type Mode = 'closed' | 'welcome' | 'rules' | 'tutorial';

export interface TodOnboarding {
  /** true = rules accepted (before or now); false = dismissed. */
  ensure: () => Promise<boolean>;
  /** Reopens the rules (read-only). */
  showRules: () => void;
  /** Render once in the screen. */
  element: React.ReactElement;
}

export function useTodOnboarding(): TodOnboarding {
  const [mode, setMode] = useState<Mode>('closed');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);

  const settle = useCallback((ok: boolean) => {
    setMode('closed');
    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(ok);
  }, []);

  const ensure = useCallback(async (): Promise<boolean> => {
    if (await hasAcceptedTodTerms()) return true;
    return new Promise<boolean>((resolve) => {
      resolverRef.current?.(false); // a previous, never-answered welcome
      resolverRef.current = resolve;
      setError(false);
      setMode('welcome');
    });
  }, []);

  const showRules = useCallback(() => setMode('rules'), []);

  const accept = useCallback(async () => {
    setSaving(true);
    setError(false);
    const ok = await acceptTodTerms();
    setSaving(false);
    if (!ok) {
      setError(true);
      return;
    }
    if (await hasSeenTodTutorial()) settle(true);
    else setMode('tutorial');
  }, [settle]);

  const finishTutorial = useCallback(() => {
    void markTodTutorialSeen();
    settle(true);
  }, [settle]);

  const element = useMemo(
    () => (
      <>
        <TodRulesModal
          visible={mode === 'welcome' || mode === 'rules'}
          readOnly={mode === 'rules'}
          saving={saving}
          error={error}
          onAccept={() => void accept()}
          onDismiss={() => (mode === 'rules' ? setMode('closed') : settle(false))}
        />
        <TodTutorialModal visible={mode === 'tutorial'} onDone={finishTutorial} />
      </>
    ),
    [mode, saving, error, accept, settle, finishTutorial],
  );

  return { ensure, showRules, element };
}

// ── Rules ───────────────────────────────────────────────────────────────────

interface RulesProps {
  visible: boolean;
  readOnly: boolean;
  saving: boolean;
  error: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}

function TodRulesModal({ visible, readOnly, saving, error, onAccept, onDismiss }: RulesProps) {
  const c = useThemeColors();
  const { t } = useTranslation('tod');
  const rules = [
    { key: 'rule1', Icon: IconHandStop },
    { key: 'rule2', Icon: IconBan },
    { key: 'rule3', Icon: IconFlag },
  ] as const;

  return (
    <AppModal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onDismiss}>
      <View style={[styles.scrim, { backgroundColor: c.scrim }]}>
        <SafeAreaView style={styles.center}>
          <View style={[styles.card, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
            <ScrollView contentContainerStyle={styles.cardContent} bounces={false}>
              <Text style={[styles.title, { color: c.textPrimary }]} accessibilityRole="header">
                {t('welcome.title')}
              </Text>
              {rules.map(({ key, Icon }) => (
                <View key={key} style={styles.ruleRow}>
                  <View style={[styles.ruleIcon, { backgroundColor: c.brandLight }]}>
                    <Icon size={20} color={c.brand} />
                  </View>
                  <Text style={[styles.ruleText, { color: c.textPrimary }]}>{t(`welcome.${key}`)}</Text>
                </View>
              ))}
              <Text style={[styles.notice, { color: c.textSecondary }]}>{t('welcome.notice')}</Text>
              {error ? <Text style={[styles.error, { color: c.danger }]}>{t('welcome.saveError')}</Text> : null}
            </ScrollView>
            <View style={styles.actions}>
              {readOnly ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={onDismiss}
                  style={[styles.primary, { backgroundColor: c.brand }]}
                >
                  <Text style={styles.primaryText}>{t('welcome.understood')}</Text>
                </Pressable>
              ) : (
                <>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: saving, busy: saving }}
                    disabled={saving}
                    onPress={onAccept}
                    style={[styles.primary, { backgroundColor: c.brand, opacity: saving ? 0.7 : 1 }]}
                  >
                    {saving ? <ActivityIndicator color={palette.onBrand} /> : <Text style={styles.primaryText}>{t('welcome.accept')}</Text>}
                  </Pressable>
                  <Pressable accessibilityRole="button" disabled={saving} onPress={onDismiss} style={styles.secondary}>
                    <Text style={[styles.secondaryText, { color: c.textSecondary }]}>{t('welcome.notNow')}</Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>
        </SafeAreaView>
      </View>
    </AppModal>
  );
}

// ── Tutorial ────────────────────────────────────────────────────────────────

function TodTutorialModal({ visible, onDone }: { visible: boolean; onDone: () => void }) {
  const c = useThemeColors();
  const { t } = useTranslation('tod');
  const [step, setStep] = useState(0);
  const steps = [
    { title: 'tutorial.step1Title', body: 'tutorial.step1Body', Icon: IconHandClick },
    { title: 'tutorial.step2Title', body: 'tutorial.step2Body', Icon: IconEye },
    { title: 'tutorial.step3Title', body: 'tutorial.step3Body', Icon: IconMessageCircle },
  ] as const;
  const current = steps[step];
  const last = step === steps.length - 1;

  const finish = () => {
    setStep(0);
    onDone();
  };

  return (
    <AppModal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={finish}>
      <View style={[styles.scrim, { backgroundColor: c.scrim }]}>
        <SafeAreaView style={styles.center}>
          <View style={[styles.card, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
            <View style={styles.cardContent}>
              <View style={[styles.tutorialIcon, { backgroundColor: c.brandLight }]}>
                <current.Icon size={40} color={c.brand} />
              </View>
              <Text style={[styles.title, { color: c.textPrimary }]} accessibilityRole="header">
                {t(current.title)}
              </Text>
              <Text style={[styles.tutorialBody, { color: c.textSecondary }]}>{t(current.body)}</Text>
              <View
                style={styles.dots}
                accessible
                accessibilityLabel={t('tutorial.progressA11y', { current: step + 1, total: steps.length })}
              >
                {steps.map((s, i) => (
                  <View
                    key={s.title}
                    style={[styles.dot, { backgroundColor: i === step ? c.brand : c.borderSubtle }]}
                  />
                ))}
              </View>
            </View>
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                onPress={last ? finish : () => setStep((n) => n + 1)}
                style={[styles.primary, { backgroundColor: c.brand }]}
              >
                <Text style={styles.primaryText}>{last ? t('tutorial.start') : t('tutorial.next')}</Text>
              </Pressable>
              {!last ? (
                <Pressable accessibilityRole="button" onPress={finish} style={styles.secondary}>
                  <Text style={[styles.secondaryText, { color: c.textSecondary }]}>{t('tutorial.skip')}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </SafeAreaView>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 400, maxHeight: '90%', borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  cardContent: { padding: 22, gap: 14, alignItems: 'stretch' },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ruleIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  ruleText: { flex: 1, fontSize: 16, fontWeight: '600', lineHeight: 22 },
  notice: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 4 },
  error: { fontSize: 14, textAlign: 'center' },
  actions: { paddingHorizontal: 22, paddingBottom: 20, gap: 6 },
  primary: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  primaryText: { color: palette.onBrand, fontSize: 17, fontWeight: '800' },
  secondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 15, fontWeight: '600' },
  tutorialIcon: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  tutorialBody: { fontSize: 16, lineHeight: 23, textAlign: 'center' },
  dots: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
