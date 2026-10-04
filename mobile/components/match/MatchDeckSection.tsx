/**
 * JChat 3.0 — Match deck section (Fase D3)
 *
 * Loads the deck for the venue (match_get_deck), resolves signed photo URLs, interest names and
 * the Super Likes left, and turns each swipe into a server call (match_swipe). Swipes are
 * optimistic: the card leaves immediately; if the server refuses, MatchDeck restores it (we
 * return false) and a short notice explains why. A Super Like with no quota left never consumes.
 * End of deck: "You've seen everyone" + opt-in switch for the generic new-people notification.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../../context/AuthContext';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { MatchDeck } from './MatchDeck';
import {
  getMatchActivity,
  getMatchDeck,
  matchErrorCode,
  matchSwipe,
  matchUndoLast,
} from '../../services/matchDeck';
import type { SwipeAction, SwipeResult } from '../../services/matchDeck';
import { fetchInterests, interestName, signedPhotoUrls } from '../../services/matchProfile';
import type { MatchCard } from '../../services/matchTypes';
import { loadUserSettings, updateMySettings } from '../../services/userSettings';

interface MatchDeckSectionProps {
  businessId: string;
  /** A swipe produced a match (D4 shows "It's a match!"). */
  onMatch: (card: MatchCard, result: SwipeResult) => void;
  /** Tap on a card (D4 opens the profile). */
  onOpenProfile: (card: MatchCard) => void;
}

export function MatchDeckSection({ businessId, onMatch, onOpenProfile }: MatchDeckSectionProps) {
  const c = useThemeColors();
  const { t, i18n } = useTranslation('match');
  const { user } = useAuth();
  const language: 'en' | 'es' = i18n.language?.startsWith('es') ? 'es' : 'en';

  const [cards, setCards] = useState<MatchCard[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [interestNames, setInterestNames] = useState<Record<string, string>>({});
  const [superLeft, setSuperLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [notifyNewPeople, setNotifyNewPeople] = useState(false);
  const [deckKey, setDeckKey] = useState(0);
  const leftScreenRef = useRef(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  }, []);

  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [deck, catalog, activity] = await Promise.all([
        getMatchDeck(businessId, 20),
        fetchInterests(),
        getMatchActivity(businessId),
      ]);
      const urls = await signedPhotoUrls(deck.flatMap((card) => card.photos.slice(0, 1)));
      setCards(deck);
      setPhotoUrls(urls);
      setInterestNames(Object.fromEntries(catalog.map((row) => [row.key, interestName(row, language)])));
      setSuperLeft(activity.super_left);
      setDeckKey((k) => k + 1); // remount the deck on a fresh list
    } catch (err) {
      setLoadError(true);
      if (matchErrorCode(err) === 'not_present') showNotice(t('deck.errors.not_present'));
    } finally {
      setLoading(false);
    }
  }, [businessId, language, showNotice, t]);

  // First load + the "new people" preference.
  useEffect(() => {
    void load();
    if (user?.id) {
      void loadUserSettings(user.id)
        .then((s) => setNotifyNewPeople(s.matchNotifyNewPeople ?? false))
        .catch(() => undefined);
    }
  }, [load, user?.id]);

  // Coming back from a profile (or any child screen): refresh the deck (swiped cards are excluded server-side).
  useFocusEffect(
    useCallback(() => {
      if (leftScreenRef.current) {
        leftScreenRef.current = false;
        void load();
      }
      return () => {
        leftScreenRef.current = true;
      };
    }, [load]),
  );

  const handleSwipe = useCallback(
    async (card: MatchCard, action: SwipeAction): Promise<boolean> => {
      try {
        const result = await matchSwipe(businessId, card.id, action);
        if (result.super_left != null) setSuperLeft(result.super_left);
        if (result.swiped && result.is_match) onMatch(card, result);
        return true; // swiped=false means "already swiped": the card is gone either way
      } catch (err) {
        const code = matchErrorCode(err);
        if (code === 'super_like_quota') setSuperLeft(0);
        showNotice(t(code ? `deck.errors.${code}` : 'deck.errors.generic'));
        return false;
      }
    },
    [businessId, onMatch, showNotice, t],
  );

  const handleUndo = useCallback(async (): Promise<boolean> => {
    try {
      const result = await matchUndoLast(businessId);
      return result.undone;
    } catch {
      showNotice(t('deck.errors.generic'));
      return false;
    }
  }, [businessId, showNotice, t]);

  const handleNotifyToggle = useCallback(
    (value: boolean) => {
      setNotifyNewPeople(value);
      void updateMySettings({ matchNotifyNewPeople: value }).catch(() => {
        setNotifyNewPeople(!value);
        showNotice(t('deck.errors.generic'));
      });
    },
    [showNotice, t],
  );

  const endContent = (
    <View style={styles.end}>
      <Text style={[styles.endTitle, { color: c.textPrimary }]}>{t('deck.endTitle')}</Text>
      <Text style={[styles.endHint, { color: c.textSecondary }]}>{t('deck.endHint')}</Text>
      <View style={[styles.endSwitchRow, { borderColor: c.borderSubtle, backgroundColor: c.bgElevated }]}>
        <Text style={[styles.endSwitchLabel, { color: c.textPrimary }]}>{t('deck.notifyNewPeople')}</Text>
        <Switch
          value={notifyNewPeople}
          onValueChange={handleNotifyToggle}
          trackColor={{ false: c.borderSubtle, true: c.brand }}
          thumbColor={palette.onBrand}
          accessibilityLabel={t('deck.notifyNewPeople')}
        />
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={c.brand} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {loadError && cards.length === 0 ? (
        <Text style={[styles.endHint, { color: c.textSecondary }]}>{t('deck.errors.generic')}</Text>
      ) : (
        <MatchDeck
          key={deckKey}
          cards={cards}
          photoUrls={photoUrls}
          interestNames={interestNames}
          superLeft={superLeft}
          onSwipe={handleSwipe}
          onUndo={handleUndo}
          onCardPress={onOpenProfile}
          endContent={endContent}
        />
      )}
      {notice && (
        <Text style={[styles.notice, { color: c.warning }]} accessibilityLiveRegion="polite">
          {notice}
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { alignSelf: 'stretch' },
  content: { alignItems: 'center', gap: 12, paddingVertical: 8 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  end: { alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  endTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  endHint: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  endSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 56,
  },
  endSwitchLabel: { flex: 1, fontSize: 14, fontWeight: '600' },
  notice: { fontSize: 13, textAlign: 'center', paddingHorizontal: 16 },
});
