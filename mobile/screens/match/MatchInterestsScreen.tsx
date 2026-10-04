/**
 * JChat 3.0 — Match interests quiz / editor (Fase D2)
 *
 * Pick at least 3 interests from the catalog (names in the user's language). Shown the first
 * time the user opens Match without interests (firstTime) and editable from "My Match profile".
 * Saved to user_interests (direct own-row writes). First-time users may skip; the quiz then
 * won't nag again (flag in AsyncStorage) but can still be opened from the profile.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { IconArrowLeft } from '@tabler/icons-react-native';

import type { MainStackParamList } from '../../navigation/AppNavigator';
import { useAuth } from '../../context/AuthContext';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { fetchInterests, fetchMyInterestKeys, interestName, saveMyInterests } from '../../services/matchProfile';
import { markInterestsQuizSkipped } from '../../services/match';
import type { InterestRow } from '../../services/matchTypes';

type Nav = NativeStackNavigationProp<MainStackParamList, 'MatchInterests'>;

export const MIN_INTERESTS = 3;

export default function MatchInterestsScreen() {
  const c = useThemeColors();
  const { t, i18n } = useTranslation('match');
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<MainStackParamList, 'MatchInterests'>>();
  const { user } = useAuth();
  const language: 'en' | 'es' = i18n.language?.startsWith('es') ? 'es' : 'en';
  const firstTime = params?.firstTime === true;

  const [catalog, setCatalog] = useState<InterestRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    void Promise.all([fetchInterests(), fetchMyInterestKeys(user.id)])
      .then(([rows, mine]) => {
        if (!alive) return;
        setCatalog(rows);
        setSelected(new Set(mine));
      })
      .catch(() => Alert.alert(t('interests.loadError')))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [user?.id, t]);

  const toggle = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!user?.id || selected.size < MIN_INTERESTS) return;
    setSaving(true);
    try {
      await saveMyInterests(user.id, [...selected]);
      navigation.goBack();
    } catch {
      Alert.alert(t('interests.saveError'));
    } finally {
      setSaving(false);
    }
  }, [user?.id, selected, navigation, t]);

  const handleSkip = useCallback(async () => {
    await markInterestsQuizSkipped();
    navigation.goBack();
  }, [navigation]);

  const missing = Math.max(0, MIN_INTERESTS - selected.size);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bgBase }]}>
      <View style={[styles.header, { borderBottomColor: c.borderSubtle }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('home.back')}
          hitSlop={10}
          style={styles.iconBtn}
        >
          <IconArrowLeft size={22} color={c.textPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: c.textPrimary }]} accessibilityRole="header">
          {t('interests.title')}
        </Text>
        <View style={styles.iconBtn} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.brand} />
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={[styles.intro, { color: c.textSecondary }]}>
              {t('interests.intro', { min: MIN_INTERESTS })}
            </Text>
            <View style={styles.chips}>
              {catalog.map((row) => {
                const active = selected.has(row.key);
                return (
                  <Pressable
                    key={row.key}
                    onPress={() => toggle(row.key)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: active }}
                    style={[
                      styles.chip,
                      active
                        ? { backgroundColor: c.brand, borderColor: c.brand }
                        : { backgroundColor: c.bgElevated, borderColor: c.borderSubtle },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: active ? palette.onBrand : c.textPrimary }]}>
                      {interestName(row, language)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: c.borderSubtle, backgroundColor: c.bgSurface }]}>
            <Text style={[styles.counter, { color: c.textSecondary }]}>
              {missing > 0 ? t('interests.pickMore', { count: missing }) : t('interests.selected', { count: selected.size })}
            </Text>
            <Pressable
              onPress={() => void handleSave()}
              disabled={missing > 0 || saving}
              accessibilityRole="button"
              style={[styles.saveBtn, { backgroundColor: c.brand, opacity: missing > 0 || saving ? 0.5 : 1 }]}
            >
              {saving ? (
                <ActivityIndicator color={palette.onBrand} />
              ) : (
                <Text style={[styles.saveText, { color: palette.onBrand }]}>{t('interests.save')}</Text>
              )}
            </Pressable>
            {firstTime && (
              <Pressable onPress={() => void handleSkip()} accessibilityRole="button" style={styles.skipBtn}>
                <Text style={{ color: c.textSecondary, fontSize: 15 }}>{t('interests.skip')}</Text>
              </Pressable>
            )}
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, gap: 16 },
  intro: { fontSize: 14, lineHeight: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 999, borderWidth: 1 },
  chipText: { fontSize: 15, fontWeight: '600' },
  footer: { padding: 16, gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  counter: { fontSize: 13, textAlign: 'center' },
  saveBtn: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontSize: 16, fontWeight: '700' },
  skipBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
