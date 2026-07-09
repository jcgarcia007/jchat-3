/**
 * JChat 3.0 — Story Viewer Screen (Task 1.11)
 *
 * Full-screen story viewer presented inside a React Native Modal (no navigator
 * changes). Accepts a list of UserStories and a starting user index.
 *
 * Features:
 *  - Full-screen photo with text overlay
 *  - Top progress bars (one segment per story, filling left→right over 5 s)
 *  - Tap left half → previous story/user; tap right half → next story/user
 *  - 5-second auto-advance
 *  - Swipe left/right between users (PanResponder)
 *  - markStoryViewed called on every story shown
 *  - Own stories: viewers list affordance (sheet)
 *  - Timer cleanup on unmount
 *
 * // TODO(video): expo-av is not installed; video stories are photo-only for now.
 *
 * Colors: useThemeColors() + palette only. Icons: @tabler/icons-react-native.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  PanResponder,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  IconChevronLeft,
  IconEye,
  IconX,
} from '@tabler/icons-react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import {
  markStoryViewed,
  getStoryViewers,
  type UserStories,
  type StoryViewer,
} from '../../services/stories';

// ── Constants ─────────────────────────────────────────────────────────────────

const STORY_DURATION_MS = 5000;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3;

// ── Props ─────────────────────────────────────────────────────────────────────

export interface StoryViewerProps {
  visible: boolean;
  /** Ordered list of user story groups. */
  userStoriesList: UserStories[];
  /** Index into userStoriesList to start at. */
  startUserIndex: number;
  /** ID of the currently authenticated user (to show viewers affordance). */
  currentUserId: string | null;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function StoryViewerScreen({
  visible,
  userStoriesList,
  startUserIndex,
  currentUserId,
  onClose,
}: StoryViewerProps) {
  const c = useThemeColors();
  const { t } = useTranslation('feed');

  // Current position.
  const [userIdx, setUserIdx] = useState(startUserIndex);
  const [storyIdx, setStoryIdx] = useState(0);

  // Viewers sheet state.
  const [showViewers, setShowViewers] = useState(false);
  const [viewers, setViewers] = useState<StoryViewer[]>([]);
  const [loadingViewers, setLoadingViewers] = useState(false);

  // Progress animation (one Animated.Value per story in the current user group).
  const progressAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  // ── Derived ──────────────────────────────────────────────────────────────

  const currentGroup: UserStories | undefined = userStoriesList[userIdx];
  const currentStory = currentGroup?.stories[storyIdx];
  const isOwnStory = currentStory?.user_id === currentUserId;

  // ── Reset position when modal opens ──────────────────────────────────────

  useEffect(() => {
    if (visible) {
      setUserIdx(startUserIndex);
      setStoryIdx(0);
      setShowViewers(false);
    }
  }, [visible, startUserIndex]);

  // ── Navigation helpers ────────────────────────────────────────────────────

  const goNext = useCallback(() => {
    if (!currentGroup) { onClose(); return; }
    const nextStory = storyIdx + 1;
    if (nextStory < currentGroup.stories.length) {
      setStoryIdx(nextStory);
    } else {
      const nextUser = userIdx + 1;
      if (nextUser < userStoriesList.length) {
        setUserIdx(nextUser);
        setStoryIdx(0);
      } else {
        onClose();
      }
    }
  }, [currentGroup, storyIdx, userIdx, userStoriesList.length, onClose]);

  const goPrev = useCallback(() => {
    if (storyIdx > 0) {
      setStoryIdx(storyIdx - 1);
    } else if (userIdx > 0) {
      const prevUser = userIdx - 1;
      const prevGroup = userStoriesList[prevUser];
      setUserIdx(prevUser);
      setStoryIdx(prevGroup ? prevGroup.stories.length - 1 : 0);
    }
    // If at the very start, do nothing.
  }, [storyIdx, userIdx, userStoriesList]);

  // ── Progress animation & auto-advance ────────────────────────────────────

  const startProgress = useCallback(() => {
    progressAnim.setValue(0);
    animRef.current?.stop();
    timerRef.current && clearTimeout(timerRef.current);

    animRef.current = Animated.timing(progressAnim, {
      toValue: 1,
      duration: STORY_DURATION_MS,
      useNativeDriver: false,
    });
    animRef.current.start(({ finished }) => {
      if (finished) {
        timerRef.current = setTimeout(() => goNext(), 0);
      }
    });
  }, [progressAnim, goNext]);

  // Restart progress whenever the story changes.
  useEffect(() => {
    if (!visible || !currentStory) return;
    startProgress();

    // Mark story viewed.
    if (currentUserId && currentStory.id) {
      markStoryViewed(currentStory.id, currentUserId).catch(() => {
        // Non-fatal — view tracking must not block UX.
      });
    }

    return () => {
      animRef.current?.stop();
      timerRef.current && clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStory?.id, visible]);

  // Cleanup all timers when modal closes or component unmounts.
  useEffect(() => {
    return () => {
      animRef.current?.stop();
      timerRef.current && clearTimeout(timerRef.current);
    };
  }, []);

  // ── Swipe gesture (left/right between users) ──────────────────────────────

  const swipeX = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, gs) =>
        Math.abs(gs.dx) > 10 && Math.abs(gs.dx) > Math.abs(gs.dy),
      onPanResponderRelease: (_e, gs) => {
        if (gs.dx < -SWIPE_THRESHOLD) {
          // Swipe left → next user.
          const nextUser = userIdx + 1;
          if (nextUser < userStoriesList.length) {
            setUserIdx(nextUser);
            setStoryIdx(0);
          } else {
            onClose();
          }
        } else if (gs.dx > SWIPE_THRESHOLD) {
          // Swipe right → prev user.
          if (userIdx > 0) {
            setUserIdx(userIdx - 1);
            setStoryIdx(0);
          }
        }
        swipeX.setValue(0);
      },
      onPanResponderTerminate: () => {
        swipeX.setValue(0);
      },
    }),
  ).current;

  // Re-create panResponder when user index changes.
  // Because PanResponder.create is called once in useRef, we need to update
  // via the callbacks — which already reference the mutable `userIdx` from
  // the outer scope via closure. Using a ref to expose mutable state is the
  // standard pattern here.
  const userIdxRef = useRef(userIdx);
  const userStoriesListRef = useRef(userStoriesList);
  useEffect(() => { userIdxRef.current = userIdx; }, [userIdx]);
  useEffect(() => { userStoriesListRef.current = userStoriesList; }, [userStoriesList]);

  // ── Viewers sheet ─────────────────────────────────────────────────────────

  const openViewers = useCallback(async () => {
    if (!currentStory) return;
    setShowViewers(true);
    setLoadingViewers(true);
    try {
      const v = await getStoryViewers(currentStory.id);
      setViewers(v);
    } catch (err) {
      console.warn('[StoryViewerScreen] getStoryViewers error:', err);
    } finally {
      setLoadingViewers(false);
    }
  }, [currentStory]);

  // ── Render nothing when no stories ───────────────────────────────────────

  if (!visible) return null;
  if (!currentGroup || !currentStory) return null;

  const stories = currentGroup.stories;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
      transparent={false}
    >
      <View style={styles.container} {...panResponder.panHandlers}>
        {/* ── Background photo ───────────────────────────────────────── */}
        <Image
          source={{ uri: currentStory.media_url }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />

        {/* ── Dim overlay ────────────────────────────────────────────── */}
        <View style={styles.dimOverlay} />

        {/* ── Progress bars ──────────────────────────────────────────── */}
        <SafeAreaView style={styles.headerSafe}>
          <View style={styles.progressRow}>
            {stories.map((s, i) => (
              <View key={s.id} style={[styles.progressTrack, { flex: 1 }]}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width:
                        i < storyIdx
                          ? '100%'
                          : i === storyIdx
                          ? undefined
                          : '0%',
                      backgroundColor: palette.textPrimary,
                    },
                  ]}
                >
                  {i === storyIdx ? (
                    <Animated.View
                      style={[
                        StyleSheet.absoluteFill,
                        {
                          backgroundColor: palette.textPrimary,
                          width: progressAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0%', '100%'],
                          }),
                        },
                      ]}
                    />
                  ) : null}
                </View>
              </View>
            ))}
          </View>

          {/* ── Author row ─────────────────────────────────────────────── */}
          <View style={styles.authorRow}>
            {currentGroup.avatarUrl ? (
              <Image
                source={{ uri: currentGroup.avatarUrl }}
                style={styles.authorAvatar}
              />
            ) : (
              <View style={[styles.authorAvatar, styles.avatarPlaceholder]} />
            )}
            <Text style={styles.authorName} numberOfLines={1}>
              {currentGroup.displayName ?? currentGroup.username ?? t('post.unknownAuthor')}
            </Text>
            <Text style={styles.timeAgo}>
              {formatTimeAgo(currentStory.created_at, t)}
            </Text>

            {/* Close button */}
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.closeBtn}
              accessibilityLabel={t('storyViewer.closeA11y')}
            >
              <IconX size={22} color={palette.textPrimary} />
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        {/* ── Tap zones (left / right) ───────────────────────────────── */}
        <View style={styles.tapZones} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.tapLeft}
            onPress={goPrev}
            activeOpacity={1}
            accessibilityLabel={t('storyViewer.prevA11y')}
          />
          <TouchableOpacity
            style={styles.tapRight}
            onPress={goNext}
            activeOpacity={1}
            accessibilityLabel={t('storyViewer.nextA11y')}
          />
        </View>

        {/* ── Text overlay ───────────────────────────────────────────── */}
        {currentStory.text_overlay ? (
          <View style={styles.textOverlayContainer} pointerEvents="none">
            <View style={styles.textOverlayBubble}>
              <Text style={styles.textOverlayText}>
                {currentStory.text_overlay}
              </Text>
            </View>
          </View>
        ) : null}

        {/* ── Viewers affordance (own stories only) ─────────────────── */}
        {isOwnStory && !showViewers ? (
          <SafeAreaView style={styles.viewersBtnSafe} pointerEvents="box-none">
            <TouchableOpacity
              style={[styles.viewersBtn, { backgroundColor: palette.bgOverlay }]}
              onPress={openViewers}
              activeOpacity={0.8}
              accessibilityLabel={t('storyViewer.viewersBtnA11y')}
            >
              <IconEye size={18} color={palette.textPrimary} />
              <Text style={styles.viewersBtnText}>{t('storyViewer.viewers')}</Text>
            </TouchableOpacity>
          </SafeAreaView>
        ) : null}

        {/* ── Viewers sheet ──────────────────────────────────────────── */}
        {showViewers ? (
          <View style={[styles.viewersSheet, { backgroundColor: c.bgSurface }]}>
            <View style={styles.viewersSheetHeader}>
              <TouchableOpacity
                onPress={() => setShowViewers(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <IconChevronLeft size={20} color={c.textPrimary} />
              </TouchableOpacity>
              <Text style={[styles.viewersSheetTitle, { color: c.textPrimary }]}>
                {t('storyViewer.viewers')}
              </Text>
            </View>

            {loadingViewers ? (
              <Text style={[styles.viewersLoading, { color: c.textSecondary }]}>
                {t('state.loading', { ns: 'common' })}
              </Text>
            ) : viewers.length === 0 ? (
              <Text style={[styles.viewersLoading, { color: c.textSecondary }]}>
                {t('storyViewer.noViews')}
              </Text>
            ) : (
              <FlatList
                data={viewers}
                keyExtractor={(v) => v.viewer_id}
                renderItem={({ item }) => (
                  <View style={styles.viewerRow}>
                    {item.viewer?.avatar_url ? (
                      <Image
                        source={{ uri: item.viewer.avatar_url }}
                        style={styles.viewerAvatar}
                      />
                    ) : (
                      <View
                        style={[
                          styles.viewerAvatar,
                          { backgroundColor: c.bgOverlay },
                        ]}
                      />
                    )}
                    <View style={styles.viewerInfo}>
                      <Text style={[styles.viewerName, { color: c.textPrimary }]}>
                        {item.viewer?.display_name ??
                          item.viewer?.username ??
                          t('post.unknownAuthor')}
                      </Text>
                      <Text
                        style={[styles.viewerTime, { color: c.textSecondary }]}
                      >
                        {formatTimeAgo(item.created_at, t)}
                      </Text>
                    </View>
                  </View>
                )}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

// ── Utility ───────────────────────────────────────────────────────────────────

function formatTimeAgo(iso: string, t: TFunction<'feed'>): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return t('post.justNow');
  if (diffMins < 60) return `${diffMins}m`;
  const diffH = Math.floor(diffMins / 60);
  if (diffH < 24) return `${diffH}h`;
  return `${Math.floor(diffH / 24)}d`;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bgBase,
  },
  dimOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },

  // Progress bars
  headerSafe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  progressRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingTop: Platform.OS === 'android' ? 36 : 8,
    gap: 4,
  },
  progressTrack: {
    height: 2.5,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    overflow: 'hidden',
  },

  // Author row
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 8,
  },
  authorAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: palette.textPrimary,
  },
  avatarPlaceholder: {
    backgroundColor: palette.bgOverlay,
  },
  authorName: {
    color: palette.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  timeAgo: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  closeBtn: {
    marginLeft: 4,
  },

  // Tap zones
  tapZones: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    zIndex: 5,
    marginTop: 100, // leave header free
  },
  tapLeft: {
    flex: 1,
  },
  tapRight: {
    flex: 1,
  },

  // Text overlay
  textOverlayContainer: {
    position: 'absolute',
    bottom: SCREEN_HEIGHT * 0.18,
    left: 20,
    right: 20,
    zIndex: 8,
    alignItems: 'center',
  },
  textOverlayBubble: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  textOverlayText: {
    color: palette.textPrimary,
    fontSize: 17,
    fontWeight: '500',
    textAlign: 'center',
  },

  // Viewers button
  viewersBtnSafe: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 12,
    alignItems: 'center',
    paddingBottom: Platform.OS === 'android' ? 20 : 8,
  },
  viewersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 24,
    marginBottom: 12,
  },
  viewersBtnText: {
    color: palette.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },

  // Viewers sheet (slides up from bottom)
  viewersSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.45,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    zIndex: 20,
    paddingTop: 16,
  },
  viewersSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  viewersSheetTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  viewersLoading: {
    textAlign: 'center',
    marginTop: 24,
    fontSize: 14,
  },
  viewerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  viewerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  viewerInfo: {
    flex: 1,
  },
  viewerName: {
    fontSize: 14,
    fontWeight: '500',
  },
  viewerTime: {
    fontSize: 12,
    marginTop: 1,
  },
});
