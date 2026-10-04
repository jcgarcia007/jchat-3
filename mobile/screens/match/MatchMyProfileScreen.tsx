/**
 * JChat 3.0 — "Mi perfil del deck" (Fase D2)
 *
 * My Match card exactly as others see it + photo management: up to 6 photos (gallery/camera),
 * WebP ~800 px upload (services/matchProfile), per-photo moderation status, reorder, delete and
 * "use my profile photo". A card needs at least one APPROVED photo to appear in the deck.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { IconArrowLeft, IconPlus, IconUserCircle } from '@tabler/icons-react-native';

import type { MainStackParamList } from '../../navigation/AppNavigator';
import { useAuth } from '../../context/AuthContext';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { MatchCard } from '../../components/match/MatchCard';
import { getPublicProfile } from '../../services/users';
import type { PublicProfileRow } from '../../services/users';
import {
  MAX_MATCH_PHOTOS,
  addAvatarAsMatchPhoto,
  addMatchPhoto,
  deleteMatchPhoto,
  fetchInterests,
  fetchMyInterestKeys,
  fetchMyMatchPhotos,
  interestName,
  reorderMatchPhotos,
} from '../../services/matchProfile';
import type { MatchCard as MatchCardData, MatchPhoto } from '../../services/matchTypes';

type Nav = NativeStackNavigationProp<MainStackParamList, 'MatchMyProfile'>;

const COLUMNS = 3;
const GAP = 8;
const SIDE_PADDING = 20;

export default function MatchMyProfileScreen() {
  const c = useThemeColors();
  const { t, i18n } = useTranslation('match');
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const language: 'en' | 'es' = i18n.language?.startsWith('es') ? 'es' : 'en';

  const [profile, setProfile] = useState<PublicProfileRow | null>(null);
  const [photos, setPhotos] = useState<MatchPhoto[]>([]);
  const [interestKeys, setInterestKeys] = useState<string[]>([]);
  const [interestNames, setInterestNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const tile = (width - SIDE_PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [p, ph, keys, catalog] = await Promise.all([
        getPublicProfile(user.id),
        fetchMyMatchPhotos(user.id),
        fetchMyInterestKeys(user.id),
        fetchInterests(),
      ]);
      setProfile(p);
      setPhotos(ph);
      setInterestKeys(keys);
      setInterestNames(Object.fromEntries(catalog.map((row) => [row.key, interestName(row, language)])));
    } catch {
      Alert.alert(t('profile.loadError'));
    } finally {
      setLoading(false);
    }
  }, [user?.id, language, t]);

  // Reload on focus so a finished moderation shows up without reopening the app.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const approved = photos.filter((p) => p.status === 'approved');
  const canAdd = photos.length < MAX_MATCH_PHOTOS;

  const previewCard: MatchCardData | null = useMemo(
    () =>
      profile
        ? {
            id: profile.id,
            username: profile.username,
            display_name: profile.display_name,
            avatar_url: profile.avatar_url,
            bio: profile.bio,
            is_verified: profile.is_verified,
            photos: approved.map((p) => p.path),
            interests: interestKeys,
          }
        : null,
    [profile, approved, interestKeys],
  );

  const run = useCallback(
    async (action: () => Promise<void>, errorKey: string) => {
      setBusy(true);
      try {
        await action();
        await load();
      } catch (err) {
        const code = (err as { code?: string })?.code;
        Alert.alert(code === '22023' ? t('profile.photos.limit') : t(errorKey));
      } finally {
        setBusy(false);
      }
    },
    [load, t],
  );

  const pickAndUpload = useCallback(
    async (source: 'gallery' | 'camera') => {
      if (!user?.id) return;
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('profile.photos.permission'));
        return;
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.9,
      };
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync({ ...options, legacy: true });
      const uri = !result.canceled ? result.assets[0]?.uri : undefined;
      if (!uri) return;
      await run(() => addMatchPhoto(user.id, uri, photos.length), 'profile.photos.uploadError');
    },
    [user?.id, photos.length, run, t],
  );

  const handleAdd = useCallback(() => {
    Alert.alert(t('profile.photos.add'), undefined, [
      { text: t('profile.photos.fromGallery'), onPress: () => void pickAndUpload('gallery') },
      { text: t('profile.photos.fromCamera'), onPress: () => void pickAndUpload('camera') },
      { text: t('menu.cancel'), style: 'cancel' },
    ]);
  }, [pickAndUpload, t]);

  const handleUseAvatar = useCallback(() => {
    if (!user?.id || !profile?.avatar_url) return;
    const avatar = profile.avatar_url;
    void run(() => addAvatarAsMatchPhoto(user.id, avatar, photos.length), 'profile.photos.uploadError');
  }, [user?.id, profile?.avatar_url, photos.length, run]);

  const move = useCallback(
    (index: number, delta: number) => {
      const next = [...photos];
      const target = index + delta;
      if (target < 0 || target >= next.length) return;
      [next[index], next[target]] = [next[target], next[index]];
      setPhotos(next); // optimistic
      void run(() => reorderMatchPhotos(next.map((p) => p.id)), 'profile.photos.reorderError');
    },
    [photos, run],
  );

  const handlePhotoMenu = useCallback(
    (photo: MatchPhoto, index: number) => {
      const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [];
      if (index > 0) buttons.push({ text: t('profile.photos.moveLeft'), onPress: () => move(index, -1) });
      if (index < photos.length - 1) buttons.push({ text: t('profile.photos.moveRight'), onPress: () => move(index, 1) });
      buttons.push({
        text: t('profile.photos.delete'),
        style: 'destructive',
        onPress: () =>
          Alert.alert(t('profile.photos.deleteConfirmTitle'), t('profile.photos.deleteConfirmBody'), [
            { text: t('menu.cancel'), style: 'cancel' },
            {
              text: t('profile.photos.delete'),
              style: 'destructive',
              onPress: () => void run(() => deleteMatchPhoto(photo), 'profile.photos.deleteError'),
            },
          ]),
      });
      buttons.push({ text: t('menu.cancel'), style: 'cancel' });
      Alert.alert(t('profile.photos.menuTitle'), undefined, buttons);
    },
    [photos.length, move, run, t],
  );

  const statusColor = (status: MatchPhoto['status']) =>
    status === 'approved' ? c.success : status === 'rejected' ? c.danger : c.warning;

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
          {t('profile.title')}
        </Text>
        <View style={styles.iconBtn} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.brand} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>{t('profile.previewTitle')}</Text>
          <Text style={[styles.hint, { color: c.textSecondary }]}>{t('profile.previewHint')}</Text>
          {previewCard && (
            <View style={styles.cardWrap}>
              <MatchCard
                card={previewCard}
                photoUrl={approved[0]?.url ?? null}
                interestNames={interestNames}
              />
            </View>
          )}

          {approved.length === 0 && (
            <View style={[styles.notice, { borderColor: c.warning, backgroundColor: c.bgElevated }]}>
              <Text style={[styles.noticeText, { color: c.textPrimary }]}>{t('profile.photos.needApproved')}</Text>
            </View>
          )}

          <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>{t('profile.photos.title')}</Text>
          <Text style={[styles.hint, { color: c.textSecondary }]}>
            {t('profile.photos.hint', { max: MAX_MATCH_PHOTOS })}
          </Text>

          <View style={styles.grid}>
            {photos.map((photo, index) => (
              <Pressable
                key={photo.id}
                onPress={() => handlePhotoMenu(photo, index)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={t('profile.photos.tileA11y', {
                  position: index + 1,
                  status: t(`profile.photos.status.${photo.status}`),
                })}
                style={[styles.tile, { width: tile, height: tile * 1.25, backgroundColor: c.bgElevated }]}
              >
                {photo.url ? (
                  <Image source={{ uri: photo.url }} style={StyleSheet.absoluteFill} contentFit="cover" />
                ) : null}
                <View style={[styles.statusPill, { backgroundColor: statusColor(photo.status) }]}>
                  <Text style={[styles.statusText, { color: palette.onBrand }]}>
                    {t(`profile.photos.status.${photo.status}`)}
                  </Text>
                </View>
                {photo.status === 'rejected' && (
                  <View style={[styles.rejectedShade, { backgroundColor: palette.scrimMedium }]}>
                    <Text style={[styles.rejectedText, { color: palette.onImage }]}>
                      {t('profile.photos.rejectedReason')}
                    </Text>
                  </View>
                )}
              </Pressable>
            ))}
            {canAdd && (
              <Pressable
                onPress={handleAdd}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={t('profile.photos.add')}
                style={[
                  styles.tile,
                  styles.addTile,
                  { width: tile, height: tile * 1.25, borderColor: c.borderSubtle, backgroundColor: c.bgElevated },
                ]}
              >
                {busy ? <ActivityIndicator color={c.brand} /> : <IconPlus size={28} color={c.brand} />}
              </Pressable>
            )}
          </View>

          {canAdd && profile?.avatar_url ? (
            <Pressable
              onPress={handleUseAvatar}
              disabled={busy}
              accessibilityRole="button"
              style={[styles.secondaryBtn, { borderColor: c.brand, opacity: busy ? 0.6 : 1 }]}
            >
              <IconUserCircle size={20} color={c.brand} />
              <Text style={[styles.secondaryBtnText, { color: c.brand }]}>{t('profile.photos.useProfilePhoto')}</Text>
            </Pressable>
          ) : null}
        </ScrollView>
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
  content: { padding: SIDE_PADDING, gap: 12, paddingBottom: 48 },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginTop: 8 },
  hint: { fontSize: 13, lineHeight: 18 },
  cardWrap: { width: '100%', maxWidth: 360, alignSelf: 'center' },
  notice: { borderWidth: 1, borderRadius: 14, padding: 14 },
  noticeText: { fontSize: 14, lineHeight: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  tile: { borderRadius: 14, overflow: 'hidden' },
  addTile: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed' },
  statusPill: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusText: { fontSize: 11, fontWeight: '700' },
  rejectedShade: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 8 },
  rejectedText: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 14,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '600' },
});
