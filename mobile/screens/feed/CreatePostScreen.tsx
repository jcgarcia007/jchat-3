/**
 * JChat 3.0 — Create Post Screen (Task 1.10)
 *
 * Flow:
 *  1. User picks photos from gallery or takes one with the camera.
 *  2. Writes a caption (≤ 500 chars) and an optional manual geotag.
 *  3. Taps "Post": each image is read as an ArrayBuffer and uploaded via
 *     `uploadPostMedia`; then `createPost` is called with the resulting URLs.
 *  4. On success the screen pops back (the post surfaces in the profile grid
 *     and feed automatically once those screens refresh).
 *
 * When Supabase is not configured `uploadPostMedia` returns the local URI so
 * the whole flow completes without a backend.
 *
 * Privacy note — PRIVACY: geotag is manual text only — never GPS.
 * The geotag field is a plain <TextInput>. There is no GPS auto-fill anywhere
 * in this file. Location permission is never requested here.
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  SafeAreaView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { IconPhoto, IconCamera, IconX } from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { useAuth } from '../../context/AuthContext';
import { createPost, uploadPostMedia } from '../../services/posts';

// ── constants ───────────────────────────────────────────────────────────────

const CAPTION_LIMIT = 500;
const MAX_IMAGES = 10;
const THUMB_SIZE = 84;

// ── types ────────────────────────────────────────────────────────────────────

interface SelectedAsset {
  /** Stable local key used as React key. */
  key: string;
  /** expo-image-picker local URI (file:// or ph://). */
  uri: string;
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Request camera-roll permission and, if denied, show an alert. */
async function requestMediaPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert(
      'Permission required', // TODO(i18n)
      'Please allow photo access in Settings to pick images.',
    );
    return false;
  }
  return true;
}

/** Request camera permission and, if denied, show an alert. */
async function requestCameraPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert(
      'Permission required', // TODO(i18n)
      'Please allow camera access in Settings to take photos.',
    );
    return false;
  }
  return true;
}

/**
 * Fetch a local URI and return its bytes as an ArrayBuffer.
 * `uploadPostMedia` accepts `ArrayBuffer | Blob`; ArrayBuffer is the most
 * portable option across Hermes and JSI without native modules.
 */
async function uriToArrayBuffer(uri: string): Promise<ArrayBuffer> {
  const response = await fetch(uri);
  return response.arrayBuffer();
}

// ── component ────────────────────────────────────────────────────────────────

export default function CreatePostScreen() {
  const c = useThemeColors();
  const navigation = useNavigation();
  const { user } = useAuth();

  const [assets, setAssets] = useState<SelectedAsset[]>([]);
  const [caption, setCaption] = useState('');
  // PRIVACY: geotag is manual text only — never GPS.
  const [geotag, setGeotag] = useState('');
  const [posting, setPosting] = useState(false);

  // ── derived state ──────────────────────────────────────────────────────────

  const captionLength = caption.length;
  const overLimit = captionLength > CAPTION_LIMIT;
  const hasContent = assets.length > 0 || caption.trim().length > 0 || geotag.trim().length > 0;
  const canPost = !overLimit && hasContent && !posting;

  // ── image picking ──────────────────────────────────────────────────────────

  const pickFromGallery = useCallback(async () => {
    const allowed = await requestMediaPermission();
    if (!allowed) return;

    const remaining = MAX_IMAGES - assets.length;
    if (remaining <= 0) {
      Alert.alert('Limit reached', `You can attach up to ${MAX_IMAGES} photos.`); // TODO(i18n)
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.85,
      allowsEditing: false,
    });

    if (result.canceled) return;

    const newAssets: SelectedAsset[] = result.assets.map((a) => ({
      key: `${a.uri}-${Date.now()}-${Math.random()}`,
      uri: a.uri,
    }));
    setAssets((prev) => [...prev, ...newAssets].slice(0, MAX_IMAGES));
  }, [assets.length]);

  const pickFromCamera = useCallback(async () => {
    const allowed = await requestCameraPermission();
    if (!allowed) return;

    if (assets.length >= MAX_IMAGES) {
      Alert.alert('Limit reached', `You can attach up to ${MAX_IMAGES} photos.`); // TODO(i18n)
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: false,
    });

    if (result.canceled) return;

    const a = result.assets[0];
    setAssets((prev) =>
      [...prev, { key: `${a.uri}-${Date.now()}`, uri: a.uri }].slice(0, MAX_IMAGES),
    );
  }, [assets.length]);

  const removeAsset = useCallback((key: string) => {
    setAssets((prev) => prev.filter((a) => a.key !== key));
  }, []);

  // ── discard guard ──────────────────────────────────────────────────────────

  const handleCancel = useCallback(() => {
    if (!hasContent) {
      navigation.goBack();
      return;
    }
    Alert.alert(
      'Discard post?', // TODO(i18n)
      'Your draft will not be saved.',
      [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => navigation.goBack(),
        },
      ],
    );
  }, [hasContent, navigation]);

  // ── submit ─────────────────────────────────────────────────────────────────

  const handlePost = useCallback(async () => {
    if (!canPost) return;
    if (!user) {
      Alert.alert('Not signed in', 'Please sign in to post.'); // TODO(i18n)
      return;
    }

    setPosting(true);
    try {
      // Upload each selected image and collect the resulting public URLs.
      const mediaUrls: string[] = await Promise.all(
        assets.map(async (asset) => {
          const buffer = await uriToArrayBuffer(asset.uri);
          return uploadPostMedia(user.id, asset.uri, buffer, 'image/jpeg');
        }),
      );

      await createPost({
        userId: user.id,
        caption: caption.trim() || undefined,
        mediaUrls,
        // PRIVACY: geotag is manual text only — never GPS.
        geotag: geotag.trim() || undefined,
      });

      navigation.goBack();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      Alert.alert('Could not post', message); // TODO(i18n)
    } finally {
      setPosting(false);
    }
  }, [canPost, user, assets, caption, geotag, navigation]);

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bgBase }]}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={[styles.header, { borderBottomColor: c.borderSubtle }]}>
        <TouchableOpacity
          onPress={handleCancel}
          hitSlop={styles.hitSlop}
          accessibilityRole="button"
          accessibilityLabel="Cancel" // TODO(i18n)
          disabled={posting}
        >
          <Text style={[styles.headerAction, { color: c.textSecondary }]}>
            Cancel {/* TODO(i18n) */}
          </Text>
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: c.textPrimary }]}>
          New Post {/* TODO(i18n) */}
        </Text>

        <TouchableOpacity
          onPress={handlePost}
          disabled={!canPost}
          hitSlop={styles.hitSlop}
          accessibilityRole="button"
          accessibilityLabel="Post" // TODO(i18n)
        >
          {posting ? (
            <ActivityIndicator size="small" color={palette.brand} />
          ) : (
            <Text
              style={[
                styles.headerAction,
                styles.headerActionPost,
                { color: canPost ? palette.brand : c.textTertiary },
              ]}
            >
              Post {/* TODO(i18n) */}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Photo thumbnails ──────────────────────────────────────────── */}
          {assets.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.thumbRow}
              contentContainerStyle={styles.thumbRowContent}
            >
              {assets.map((asset) => (
                <View key={asset.key} style={styles.thumbWrapper}>
                  <Image
                    source={{ uri: asset.uri }}
                    style={styles.thumb}
                    resizeMode="cover"
                    accessibilityIgnoresInvertColors
                  />
                  <TouchableOpacity
                    style={[styles.removeBtn, { backgroundColor: c.bgOverlay }]}
                    onPress={() => removeAsset(asset.key)}
                    hitSlop={styles.hitSlop}
                    accessibilityRole="button"
                    accessibilityLabel="Remove photo" // TODO(i18n)
                  >
                    <IconX size={14} color={c.textPrimary} strokeWidth={2.5} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}

          {/* ── Media pickers ─────────────────────────────────────────────── */}
          <View style={[styles.pickerRow, { borderColor: c.borderSubtle }]}>
            <TouchableOpacity
              style={[styles.pickerBtn, { backgroundColor: c.bgSurface }]}
              onPress={pickFromGallery}
              disabled={posting || assets.length >= MAX_IMAGES}
              accessibilityRole="button"
              accessibilityLabel="Pick from gallery" // TODO(i18n)
            >
              <IconPhoto size={22} color={palette.brand} strokeWidth={1.8} />
              <Text style={[styles.pickerLabel, { color: c.textSecondary }]}>
                Gallery {/* TODO(i18n) */}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.pickerBtn, { backgroundColor: c.bgSurface }]}
              onPress={pickFromCamera}
              disabled={posting || assets.length >= MAX_IMAGES}
              accessibilityRole="button"
              accessibilityLabel="Open camera" // TODO(i18n)
            >
              <IconCamera size={22} color={palette.brand} strokeWidth={1.8} />
              <Text style={[styles.pickerLabel, { color: c.textSecondary }]}>
                Camera {/* TODO(i18n) */}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── Caption ───────────────────────────────────────────────────── */}
          <View style={[styles.fieldCard, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
            <TextInput
              style={[styles.captionInput, { color: c.textPrimary }]}
              placeholder="Write a caption…" // TODO(i18n)
              placeholderTextColor={c.textTertiary}
              value={caption}
              onChangeText={setCaption}
              multiline
              maxLength={CAPTION_LIMIT + 20} // allow slight overtype for UX; button still disabled
              textAlignVertical="top"
              editable={!posting}
              accessibilityLabel="Caption" // TODO(i18n)
              accessibilityHint={`Up to ${CAPTION_LIMIT} characters`}
            />
            <Text
              style={[
                styles.counter,
                { color: overLimit ? palette.danger : c.textTertiary },
              ]}
            >
              {captionLength}/{CAPTION_LIMIT}
            </Text>
          </View>

          {/* ── Geotag (manual text only) ─────────────────────────────────── */}
          {/*
           * PRIVACY: geotag is manual text only — never GPS.
           * This field is a plain text input. No location permission is
           * requested. No coordinates are ever read, inferred, or auto-filled.
           */}
          <View style={[styles.fieldCard, styles.fieldCardRow, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
            <Text style={[styles.fieldLabel, { color: c.textSecondary }]}>
              Location {/* TODO(i18n) */}
            </Text>
            <TextInput
              style={[styles.geotagInput, { color: c.textPrimary }]}
              placeholder="Add a place (optional)" // TODO(i18n)
              placeholderTextColor={c.textTertiary}
              value={geotag}
              onChangeText={setGeotag}
              returnKeyType="done"
              editable={!posting}
              accessibilityLabel="Location tag (manual text)" // TODO(i18n)
              accessibilityHint="Type a place name. Location is never detected automatically."
            />
          </View>

          {/* Bottom spacer so content clears the keyboard avoid offset */}
          <View style={styles.bottomSpacer} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  headerAction: {
    fontSize: 16,
    fontWeight: '400',
  },
  headerActionPost: {
    fontWeight: '600',
  },
  hitSlop: {
    top: 8,
    bottom: 8,
    left: 8,
    right: 8,
  } as const,

  // Scroll
  scrollContent: {
    padding: 16,
    gap: 12,
  },

  // Thumbnails
  thumbRow: {
    flexGrow: 0,
  },
  thumbRowContent: {
    gap: 8,
    paddingVertical: 4,
  },
  thumbWrapper: {
    position: 'relative',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 8,
  },
  removeBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.9,
  },

  // Picker row
  pickerRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pickerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  pickerLabel: {
    fontSize: 14,
    fontWeight: '500',
  },

  // Field cards
  fieldCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
  },
  fieldCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '500',
    minWidth: 68,
  },

  // Caption
  captionInput: {
    fontSize: 15,
    lineHeight: 22,
    minHeight: 100,
  },
  counter: {
    fontSize: 12,
    textAlign: 'right',
    marginTop: 6,
  },

  // Geotag
  geotagInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },

  bottomSpacer: {
    height: 40,
  },
});
