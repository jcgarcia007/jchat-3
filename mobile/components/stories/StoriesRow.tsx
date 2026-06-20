/**
 * JChat 3.0 — StoriesRow (Task 1.11)
 *
 * Horizontal row of avatar circles shown at the top of FeedScreen.
 *
 * Layout (left → right):
 *   [+ Your Story] [User A] [User B] …
 *
 * Ring logic:
 *   - Colored ring (palette.brand) → user has at least one UNSEEN story.
 *   - Grey ring                    → all stories already seen.
 *   - No ring on "Your Story" slot → replaced by the (+) icon.
 *
 * "Your Story" tap:
 *   1. Requests media library permission.
 *   2. Opens image picker.
 *   3. Optional text-overlay input (Alert.prompt on iOS; TextInput modal on Android).
 *   4. Uploads via uploadStoryMedia + createStory.
 *   5. Refreshes the stories list.
 *
 * Other avatar tap → opens StoryViewerScreen Modal for that user's group.
 *
 * Realtime: subscribes to `stories` INSERT on mount; refreshes list on new row.
 * Unsubscribes on unmount.
 *
 * // TODO(video): expo-av not installed; video stories not supported yet.
 * // TODO(i18n): all strings English.
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
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { IconPlus } from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { supabase, isSupabaseConfigured } from '../../services/supabase';
import {
  getActiveStories,
  createStory,
  uploadStoryMedia,
  type UserStories,
} from '../../services/stories';
import StoryViewerScreen from '../../screens/stories/StoryViewerScreen';

// ── Types ─────────────────────────────────────────────────────────────────────

interface StoriesRowProps {
  currentUserId: string;
  currentUserAvatarUrl?: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const AVATAR_SIZE = 60;
const RING_WIDTH = 2.5;
const RING_GAP = 2;
const ITEM_WIDTH = AVATAR_SIZE + (RING_WIDTH + RING_GAP) * 2 + 20; // total touch target

// ── Component ─────────────────────────────────────────────────────────────────

export default function StoriesRow({
  currentUserId,
  currentUserAvatarUrl,
}: StoriesRowProps) {
  const c = useThemeColors();

  // Stories state.
  const [userStoriesList, setUserStoriesList] = useState<UserStories[]>([]);
  const [loading, setLoading] = useState(true);

  // Story viewer state.
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerStartIndex, setViewerStartIndex] = useState(0);

  // Create-story overlay state (Android text overlay).
  const [creatingStory, setCreatingStory] = useState(false);
  const [pendingUri, setPendingUri] = useState<string | null>(null);
  const [textInput, setTextInput] = useState('');
  const [showTextModal, setShowTextModal] = useState(false);
  const [uploading, setUploading] = useState(false);

  // ── Load stories ────────────────────────────────────────────────────────

  const loadStories = useCallback(async () => {
    try {
      const groups = await getActiveStories(currentUserId);
      setUserStoriesList(groups);
    } catch (err) {
      console.warn('[StoriesRow] loadStories error:', err);
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    loadStories();
  }, [loadStories]);

  // ── Realtime subscription (stories INSERT) ───────────────────────────────

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const channel = supabase
      .channel('stories_realtime_row')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'stories' },
        () => {
          // Refresh on any new story (we re-filter expired ones in getActiveStories).
          loadStories();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadStories]);

  // ── Open story viewer ────────────────────────────────────────────────────

  const openViewer = useCallback((startIndex: number) => {
    setViewerStartIndex(startIndex);
    setViewerVisible(true);
  }, []);

  // ── Create story flow ────────────────────────────────────────────────────

  const handleCreateStory = useCallback(async () => {
    if (creatingStory || uploading) return;
    setCreatingStory(true);

    // 1. Request permission.
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission required',
        'Allow photo access in Settings to add a story.',
      );
      setCreatingStory(false);
      return;
    }

    // 2. Launch image picker.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.85,
    });

    setCreatingStory(false);

    if (result.canceled || !result.assets || result.assets.length === 0) return;

    const asset = result.assets[0];
    const localUri = asset.uri;
    setPendingUri(localUri);

    // 3. Ask for optional text overlay.
    if (Platform.OS === 'ios') {
      Alert.prompt(
        'Add text (optional)',
        'This text will appear on your story.',
        [
          {
            text: 'Skip',
            onPress: () => void uploadAndCreate(localUri, null),
          },
          {
            text: 'Add',
            onPress: (text: string | undefined) => void uploadAndCreate(localUri, text ?? null),
          },
        ],
        'plain-text',
        '',
      );
    } else {
      // Android: show a simple in-app modal.
      setTextInput('');
      setShowTextModal(true);
    }
  }, [creatingStory, uploading]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Upload media + create DB row, then refresh. */
  const uploadAndCreate = useCallback(
    async (localUri: string, textOverlay: string | null) => {
      setUploading(true);
      setPendingUri(null);
      try {
        let mediaUrl = localUri;

        if (isSupabaseConfigured) {
          // Fetch the local file as a blob.
          const response = await fetch(localUri);
          const blob = await response.blob();
          mediaUrl = await uploadStoryMedia(
            currentUserId,
            localUri,
            blob,
            'image/jpeg',
          );
        }

        await createStory({
          userId: currentUserId,
          mediaUrl,
          textOverlay: textOverlay?.trim() || null,
        });

        await loadStories();
      } catch (err) {
        console.warn('[StoriesRow] uploadAndCreate error:', err);
        Alert.alert('Error', 'Could not create your story. Please try again.');
      } finally {
        setUploading(false);
      }
    },
    [currentUserId, loadStories],
  );

  // Android text modal confirm.
  const handleAndroidTextConfirm = useCallback(
    (skip: boolean) => {
      setShowTextModal(false);
      if (!pendingUri) return;
      void uploadAndCreate(pendingUri, skip ? null : textInput);
    },
    [pendingUri, textInput, uploadAndCreate],
  );

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: c.bgBase }]}>
        <ActivityIndicator size="small" color={c.brand} />
      </View>
    );
  }

  return (
    <>
      <View style={[styles.container, { backgroundColor: c.bgBase }]}>
        <FlatList
          horizontal
          data={userStoriesList}
          keyExtractor={(item) => item.userId}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          // "Your Story" slot as ListHeaderComponent.
          ListHeaderComponent={
            <TouchableOpacity
              style={styles.item}
              onPress={handleCreateStory}
              disabled={uploading}
              accessibilityLabel="Add your story"
            >
              <View
                style={[
                  styles.avatarWrapper,
                  styles.avatarAdd,
                  { borderColor: c.borderSubtle },
                ]}
              >
                {uploading ? (
                  <ActivityIndicator size="small" color={palette.brand} />
                ) : currentUserAvatarUrl ? (
                  <Image
                    source={{ uri: currentUserAvatarUrl }}
                    style={styles.avatar}
                  />
                ) : (
                  <View
                    style={[styles.avatar, { backgroundColor: c.bgOverlay }]}
                  />
                )}
                {/* Plus badge */}
                {!uploading && (
                  <View
                    style={[
                      styles.plusBadge,
                      { backgroundColor: palette.brand, borderColor: c.bgBase },
                    ]}
                  >
                    <IconPlus size={12} color={palette.textPrimary} />
                  </View>
                )}
              </View>
              <Text
                style={[styles.label, { color: c.textSecondary }]}
                numberOfLines={1}
              >
                Your Story
              </Text>
            </TouchableOpacity>
          }
          renderItem={({ item, index }) => {
            const ringColor = item.hasUnseen
              ? palette.brand
              : c.borderSubtle;
            return (
              <TouchableOpacity
                style={styles.item}
                onPress={() => openViewer(index)}
                accessibilityLabel={`View ${item.displayName ?? item.username ?? 'story'}`}
              >
                <View
                  style={[
                    styles.avatarWrapper,
                    { borderColor: ringColor },
                  ]}
                >
                  {item.avatarUrl ? (
                    <Image
                      source={{ uri: item.avatarUrl }}
                      style={styles.avatar}
                    />
                  ) : (
                    <View
                      style={[styles.avatar, { backgroundColor: c.bgOverlay }]}
                    />
                  )}
                </View>
                <Text
                  style={[styles.label, { color: c.textSecondary }]}
                  numberOfLines={1}
                >
                  {item.displayName ?? item.username ?? 'User'}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* ── Story viewer Modal ──────────────────────────────────────── */}
      <StoryViewerScreen
        visible={viewerVisible}
        userStoriesList={userStoriesList}
        startUserIndex={viewerStartIndex}
        currentUserId={currentUserId}
        onClose={() => {
          setViewerVisible(false);
          // Refresh so seen rings update.
          void loadStories();
        }}
      />

      {/* ── Android text overlay modal ──────────────────────────────── */}
      {showTextModal && (
        <View style={styles.textModalBackdrop}>
          <View style={[styles.textModalCard, { backgroundColor: c.bgSurface }]}>
            <Text style={[styles.textModalTitle, { color: c.textPrimary }]}>
              Add text (optional)
            </Text>
            <TextInput
              style={[
                styles.textModalInput,
                { color: c.textPrimary, borderColor: c.borderSubtle },
              ]}
              placeholder="Type something…"
              placeholderTextColor={c.textTertiary}
              value={textInput}
              onChangeText={setTextInput}
              maxLength={120}
              autoFocus
            />
            <View style={styles.textModalActions}>
              <TouchableOpacity
                style={[styles.textModalBtn, { backgroundColor: c.bgOverlay }]}
                onPress={() => handleAndroidTextConfirm(true)}
              >
                <Text style={[styles.textModalBtnLabel, { color: c.textSecondary }]}>
                  Skip
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.textModalBtn, { backgroundColor: palette.brand }]}
                onPress={() => handleAndroidTextConfirm(false)}
              >
                <Text style={[styles.textModalBtnLabel, { color: palette.textPrimary }]}>
                  Add
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    height: AVATAR_SIZE + (RING_WIDTH + RING_GAP) * 2 + 30,
    paddingVertical: 6,
  },
  loadingContainer: {
    height: AVATAR_SIZE + (RING_WIDTH + RING_GAP) * 2 + 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 8,
    gap: 0,
  },
  item: {
    width: ITEM_WIDTH,
    alignItems: 'center',
    gap: 4,
  },
  avatarWrapper: {
    width: AVATAR_SIZE + (RING_WIDTH + RING_GAP) * 2,
    height: AVATAR_SIZE + (RING_WIDTH + RING_GAP) * 2,
    borderRadius: (AVATAR_SIZE + (RING_WIDTH + RING_GAP) * 2) / 2,
    borderWidth: RING_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarAdd: {
    borderStyle: 'dashed',
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  plusBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    textAlign: 'center',
    width: ITEM_WIDTH - 4,
  },

  // Android text modal.
  textModalBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  textModalCard: {
    width: '82%',
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  textModalTitle: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  textModalInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    fontSize: 15,
  },
  textModalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  textModalBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  textModalBtnLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
});
