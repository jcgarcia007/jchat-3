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
import { MatchPassedList } from './MatchPassedList';
import { MatchStateView } from './MatchStateView';
import {
  getMatchActivity,
  getMatchDeck,
  getMatchPassed,
  matchErrorCode,
  matchRelike,
  matchSwipe,
  matchUndoLast,
} from '../../services/matchDeck';
import type { SwipeAction, SwipeResult } from '../../services/matchDeck';
import { fetchInterests, fetchMyMatchPhotos, interestName, signedPhotoUrls } from '../../services/matchProfile';
import type { MatchCard } from '../../services/matchTypes';
import { loadUserSettings, updateMySettings } from '../../services/userSettings';

interface MatchDeckSectionProps {
  businessId: string;
  /** A swipe produced a match (D4 shows "It's a match!"). */
  onMatch: (card: MatchCard, result: SwipeResult) => void;
  /** Tap on a card (D4 opens the profile). */
  onOpenProfile: (card: MatchCard) => void;
  /** Primary action of the empty states: back to the venue's chat room. */
  onBackToChat: () => void;
  onOpenActivity: () => void;
  /** Opens "My Match profile" (no approved photo yet). */
  onUploadPhoto: () => void;
}

/** Runs `run` once when it mounts (the end-of-deck screen appearing). */
function RunOnMount({ run }: { run: () => void }): null {
  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export function MatchDeckSection({
  businessId,
  onMatch,
  onOpenProfile,
  onBackToChat,
  onOpenActivity,
  onUploadPhoto,
}: MatchDeckSectionProps) {
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
  // null = unknown yet (don't block); false = no approved photo → can't appear in the deck.
  const [hasApprovedPhoto, setHasApprovedPhoto] = useState<boolean | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [notifyNewPeople, setNotifyNewPeople] = useState(false);
  const [deckKey, setDeckKey] = useState(0);
  // "Review the people I passed" (end of deck): the list, and which row is being liked.
  const [passed, setPassed] = useState<MatchCard[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [relikeBusyId, setRelikeBusyId] = useState<string | null>(null);
  const leftScreenRef = useRef(false);
  // Swipes of this visit, newest last: an undo takes the last one back (and out of the review list if it was a pass).
  const swipedRef = useRef<{ card: MatchCard; action: SwipeAction }[]>([]);
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
      const [deck, catalog, activity, approved, passedCards] = await Promise.all([
        getMatchDeck(businessId, 20),
        fetchInterests(),
        getMatchActivity(businessId),
        user?.id
          ? fetchMyMatchPhotos(user.id).then((photos) => photos.some((p) => p.status === 'approved')).catch(() => true)
          : Promise.resolve(true),
        getMatchPassed(businessId).catch(() => [] as MatchCard[]),
      ]);
      setHasApprovedPhoto(approved);
      const urls = await signedPhotoUrls([...deck, ...passedCards].flatMap((card) => card.photos.slice(0, 1)));
      setCards(deck);
      setPassed(passedCards);
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
  }, [businessId, language, showNotice, t, user?.id]);

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
        if (result.swiped) {
          swipedRef.current.push({ card, action });
          // The review list must include what I pass in THIS visit, not only what load() saw on mount.
          if (action === 'pass') setPassed((prev) => [card, ...prev.filter((p) => p.id !== card.id)]);
        }
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
      if (result.undone) {
        const last = swipedRef.current.pop();
        if (last?.action === 'pass') setPassed((prev) => prev.filter((p) => p.id !== last.card.id));
      }
      return result.undone;
    } catch {
      showNotice(t('deck.errors.generic'));
      return false;
    }
  }, [businessId, showNotice, t]);

  // Review: a normal like (never super) on someone I passed; may be a match. "Keep passing" just hides the row.
  const handleRelike = useCallback(
    async (card: MatchCard) => {
      if (relikeBusyId) return;
      setRelikeBusyId(card.id);
      try {
        const result = await matchRelike(businessId, card.id);
        setPassed((prev) => prev.filter((p) => p.id !== card.id));
        if (result.is_match) onMatch(card, result);
      } catch (err) {
        const code = matchErrorCode(err);
        if (code === 'not_passed' || code === 'not_in_same_venue') {
          setPassed((prev) => prev.filter((p) => p.id !== card.id)); // no longer reviewable
        }
        showNotice(t(code ? `deck.errors.${code}` : 'deck.errors.generic'));
      } finally {
        setRelikeBusyId(null);
      }
    },
    [businessId, onMatch, relikeBusyId, showNotice, t],
  );

  const handleSkipPassed = useCallback((card: MatchCard) => {
    setPassed((prev) => prev.filter((p) => p.id !== card.id));
  }, []);

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

  // Reaching the end of the deck: take the authoritative list from the server (the local additions above
  // keep it right meanwhile; this also drops anyone who has since left the venue).
  const refreshPassed = useCallback(async () => {
    try {
      const fresh = await getMatchPassed(businessId);
      const urls = await signedPhotoUrls(fresh.flatMap((card) => card.photos.slice(0, 1)));
      setPassed(fresh);
      setPhotoUrls((prev) => ({ ...prev, ...urls }));
    } catch {
      // keep the local list
    }
  }, [businessId]);

  // End of deck: "Review the ones I passed (N)" is the main action when there are any; then "Back to
  // chat", the new-people switch and a "View my activity" link.
  const hasPassed = passed.length > 0;
  const endContent = (
    <>
      <RunOnMount run={() => void refreshPassed()} />
      <MatchStateView
      title={t('deck.endTitle')}
      message={t('deck.endHint')}
      primary={
        hasPassed
          ? { label: t('deck.reviewPassed', { count: passed.length }), onPress: () => setReviewing(true) }
          : { label: t('states.backToChat'), onPress: onBackToChat }
      }
      secondary={hasPassed ? { label: t('states.backToChat'), onPress: onBackToChat } : undefined}
      link={{ label: t('states.viewActivity'), onPress: onOpenActivity }}
    >
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
      </MatchStateView>
    </>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={c.brand} />
      </View>
    );
  }

  if (hasApprovedPhoto === false) {
    return (
      <MatchStateView
        title={t('states.noPhotoTitle')}
        message={t('profile.photos.needApproved')}
        primary={{ label: t('states.uploadPhoto'), onPress: onUploadPhoto }}
        secondary={{ label: t('states.backToChat'), onPress: onBackToChat }}
      />
    );
  }

  if (reviewing) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <MatchPassedList
          cards={passed}
          photoUrls={photoUrls}
          busyId={relikeBusyId}
          onLike={(card) => void handleRelike(card)}
          onSkip={handleSkipPassed}
          onOpenProfile={onOpenProfile}
          onBack={() => setReviewing(false)}
          notice={notice}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {loadError && cards.length === 0 ? (
        <MatchStateView
          message={notice ?? t('deck.errors.generic')}
          primary={{ label: t('states.retry'), onPress: () => void load() }}
          secondary={{ label: t('states.backToChat'), onPress: onBackToChat }}
        />
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
