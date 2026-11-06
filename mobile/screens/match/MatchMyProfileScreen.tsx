/**
 * JChat 3.0 — "Mi perfil de Match" (Match v2): ONE screen with four views.
 *
 *  • edit     — progress "n of 4", Soy, Me interesa, age range, photos (min 1, max 6, "Principal" on the first), interests (optional) and
 *               "Confirmar perfil". With no photos yet, a featured shortcut copies the profile photo (it enters as 'pending': avatars are not moderated).
 *  • result   — what "Confirmar perfil" shows while a photo is in review ("Revisando tus fotos") or when every photo was refused ("Cambia tu foto").
 *  • complete — "Perfil completo": the summary and the editable rows; also where a tap on the photo-approved notification lands.
 *  • preview  — "Ver cómo me ven": my card full screen, exactly as the deck shows it.
 * Gender and seeking live in match_profiles (private, only my row); they are never shown on the card.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Spinner } from '../../components/common/Spinner';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { IconArrowLeft, IconCheck, IconClock, IconMinus, IconPlus } from '@tabler/icons-react-native';

import type { MainStackParamList } from '../../navigation/AppNavigator';
import { useAuth } from '../../context/AuthContext';
import { useVenueSession } from '../../context/VenueSessionContext';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { typeCap, typeStyle } from '../../theme/typography';
import { MatchCard } from '../../components/match/MatchCard';
import { useMyMatchProfile } from '../../hooks/useMyMatchProfile';
import { joinMatchVenue } from '../../services/matchPresence';
import { getPublicProfile } from '../../services/users';
import type { PublicProfileRow } from '../../services/users';
import {
  MAX_MATCH_PHOTOS,
  addAvatarAsMatchPhoto,
  addMatchPhoto,
  deleteMatchPhoto,
  fetchInterests,
  fetchMyBirthYear,
  fetchMyInterestKeys,
  interestName,
  reorderMatchPhotos,
  saveMyMatchPrefs,
} from '../../services/matchProfile';
import type { MatchCard as MatchCardData, MatchPhoto } from '../../services/matchTypes';
import { loadUserSettings, updateMySettings } from '../../services/userSettings';
import { safeLaunchCamera } from '../../utils/safePicker';
import { pickPhotoFromLibrary } from '../../services/photoPicker';
import { showAlert } from '../../utils/dialog';
import { useAppWindow } from '../../utils/appWindow';
import { ThemedSwitch } from '../../components/common/ThemedSwitch';
import {
  MATCH_GENDERS,
  MATCH_SEEKINGS,
  MAX_MATCH_INTERESTS,
  ageFromBirthYear,
  canConfirmMatchProfile,
  isChangeLimitError,
  missingForConfirm,
  progressCounts,
  type MatchGender,
  type MatchSeeking,
} from '../../utils/matchProfileState';

type Nav = NativeStackNavigationProp<MainStackParamList, 'MatchMyProfile'>;

const MIN_AGE = 18;
const MAX_AGE = 99;
const COLUMNS = 3;
const GAP = 8;
const SIDE_PADDING = 20;
/** While a photo is in review the result screen asks again every few seconds ("suele tardar unos segundos"). */

type View_ = 'edit' | 'result' | 'complete' | 'preview';

export default function MatchMyProfileScreen() {
  const c = useThemeColors();
  const { t, i18n } = useTranslation('match');
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<MainStackParamList, 'MatchMyProfile'>>();
  const { user } = useAuth();
  const { session } = useVenueSession();
  const { width } = useAppWindow();
  const language: 'en' | 'es' = i18n.language?.startsWith('es') ? 'es' : 'en';
  const mine = useMyMatchProfile();
  const { prefs, photos, summary, reload } = mine;

  const [profile, setProfile] = useState<PublicProfileRow | null>(null);
  const [birthYear, setBirthYear] = useState<number | null>(null);
  const [interestKeys, setInterestKeys] = useState<string[]>([]);
  const [interestNames, setInterestNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  // Match settings (users.settings): age range is custom only once the user sets it.
  const [ageMin, setAgeMin] = useState<number | null>(null);
  const [ageMax, setAgeMax] = useState<number | null>(null);
  const [notifyNewPeople, setNotifyNewPeople] = useState(false);
  const [gamesEnabled, setGamesEnabled] = useState(true);
  // Which view: the person asked to confirm (or a notification sent them to the result), is editing, or is previewing.
  const [confirmed, setConfirmed] = useState(params?.focus === 'result');
  const [editing, setEditing] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const tile = (width - SIDE_PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
  const approved = photos.filter((p) => p.status === 'approved');
  const canAdd = photos.length < MAX_MATCH_PHOTOS;

  const view: View_ = previewing
    ? 'preview'
    : confirmed && summary.state !== 'incomplete'
      ? summary.state === 'complete' ? 'complete' : 'result'
      : !editing && summary.state === 'complete' ? 'complete' : 'edit';

  // ONE source for the progress text (bar, a11y label in every view): the summary.
  const progressA11y = t('profile.v2.progressA11y', progressCounts(summary));

  const loadExtras = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [p, keys, catalog, settings, year] = await Promise.all([
        getPublicProfile(user.id),
        fetchMyInterestKeys(user.id),
        fetchInterests(),
        loadUserSettings(user.id),
        fetchMyBirthYear(user.id),
      ]);
      setAgeMin(settings.matchAgeMin ?? null);
      setAgeMax(settings.matchAgeMax ?? null);
      setNotifyNewPeople(settings.matchNotifyNewPeople ?? false);
      setGamesEnabled(settings.gamesEnabled ?? true);
      setProfile(p);
      setInterestKeys(keys);
      setBirthYear(year);
      setInterestNames(Object.fromEntries(catalog.map((row) => [row.key, interestName(row, language)])));
    } catch {
      showAlert(t('profile.loadError'));
    }
  }, [user?.id, language, t]);

  // Reload on focus (the photos and prefs come from the hook) so a finished moderation shows up without reopening the app.
  useFocusEffect(
    useCallback(() => {
      void loadExtras();
    }, [loadExtras]),
  );

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
        await reload();
      } catch (err) {
        const code = (err as { code?: string })?.code;
        showAlert(code === '22023' ? t('profile.photos.limit') : t(errorKey));
      } finally {
        setBusy(false);
      }
    },
    [reload, t],
  );

  // ── Gender / seeking ─────────────────────────────────────────────────────────

  const savePrefs = useCallback(
    async (gender: MatchGender | null, seeking: MatchSeeking | null) => {
      if (!user?.id) return;
      setBusy(true);
      try {
        await saveMyMatchPrefs(user.id, gender, seeking);
      } catch (err) {
        showAlert(isChangeLimitError(err) ? t('profile.v2.changeLimit') : t('profile.v2.prefsSaveError'));
      } finally {
        await reload(); // the server's value is the truth (a refused change leaves the old one)
        setBusy(false);
      }
    },
    [user?.id, reload, t],
  );

  // ── Photos ───────────────────────────────────────────────────────────────────

  const pickAndUpload = useCallback(
    async (source: 'gallery' | 'camera') => {
      if (!user?.id) return;
      // Only the camera needs a permission; the photo library does not (services/photoPicker.ts).
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          showAlert(t('profile.photos.permission'));
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 5],
        quality: 0.9,
      };
      const result = source === 'camera' ? await safeLaunchCamera(options) : await pickPhotoFromLibrary(options);
      const uri = result && !result.canceled ? result.assets[0]?.uri : null;
      if (!uri) return;
      await run(() => addMatchPhoto(user.id, uri, photos.length), 'profile.photos.uploadError');
    },
    [user?.id, photos.length, run, t],
  );

  const copyProfilePhoto = useCallback(() => {
    const avatar = profile?.avatar_url;
    if (!user?.id || !avatar) return;
    // The copy enters as 'pending' like any photo: avatars are not moderated, so it is checked before it can appear.
    void run(() => addAvatarAsMatchPhoto(user.id, avatar, photos.length), 'profile.photos.uploadError');
  }, [user?.id, profile?.avatar_url, photos.length, run]);

  const handleAdd = useCallback(() => {
    const buttons: { text: string; onPress: () => void }[] = [
      { text: t('profile.photos.fromGallery'), onPress: () => void pickAndUpload('gallery') },
      { text: t('profile.photos.fromCamera'), onPress: () => void pickAndUpload('camera') },
    ];
    if (profile?.avatar_url) buttons.push({ text: t('profile.photos.copyProfilePhoto'), onPress: copyProfilePhoto });
    showAlert(t('profile.photos.add'), undefined, buttons);
  }, [pickAndUpload, profile?.avatar_url, copyProfilePhoto, t]);

  const move = useCallback(
    (index: number, delta: -1 | 1) => {
      const next = [...photos];
      const target = index + delta;
      if (target < 0 || target >= next.length) return;
      [next[index], next[target]] = [next[target], next[index]];
      void run(() => reorderMatchPhotos(next.map((p) => p.id)), 'profile.photos.reorderError');
    },
    [photos, run],
  );

  const handlePhotoMenu = useCallback(
    (photo: MatchPhoto, index: number) => {
      const buttons: { text: string; style?: 'destructive' | 'cancel'; onPress?: () => void }[] = [];
      if (index > 0) buttons.push({ text: t('profile.photos.moveLeft'), onPress: () => move(index, -1) });
      if (index < photos.length - 1) buttons.push({ text: t('profile.photos.moveRight'), onPress: () => move(index, 1) });
      buttons.push({
        text: t('profile.photos.delete'),
        style: 'destructive',
        onPress: () =>
          showAlert(t('profile.photos.deleteConfirmTitle'), t('profile.photos.deleteConfirmBody'), [
            { text: t('leave.cancel'), style: 'cancel' },
            { text: t('profile.photos.delete'), style: 'destructive', onPress: () => void run(() => deleteMatchPhoto(photo), 'profile.photos.deleteError') },
          ]),
      });
      showAlert(t('profile.photos.menuTitle'), undefined, buttons);
    },
    [photos.length, move, run, t],
  );

  // ── Settings: age range, notification ─────────────────────────────────────────

  /** Optimistic settings write; on failure reload the real values and tell the user. */
  const saveSetting = useCallback(
    (patch: Parameters<typeof updateMySettings>[0]) => {
      void updateMySettings(patch).catch(() => {
        showAlert(t('profile.settings.saveError'));
        void loadExtras();
      });
    },
    [loadExtras, t],
  );

  const changeAge = useCallback(
    (which: 'min' | 'max', delta: number) => {
      const min = ageMin ?? MIN_AGE;
      const max = ageMax ?? MAX_AGE;
      const nextMin = which === 'min' ? Math.min(Math.max(min + delta, MIN_AGE), max) : min;
      const nextMax = which === 'max' ? Math.max(Math.min(max + delta, MAX_AGE), min) : max;
      setAgeMin(nextMin);
      setAgeMax(nextMax);
      saveSetting({ matchAgeMin: nextMin, matchAgeMax: nextMax });
    },
    [ageMin, ageMax, saveSetting],
  );

  const customizeAge = useCallback(() => {
    setAgeMin(MIN_AGE);
    setAgeMax(MAX_AGE);
    saveSetting({ matchAgeMin: MIN_AGE, matchAgeMax: MAX_AGE });
  }, [saveSetting]);

  const toggleNotify = useCallback(
    (value: boolean) => {
      setNotifyNewPeople(value);
      saveSetting({ matchNotifyNewPeople: value });
    },
    [saveSetting],
  );

  // ── Navigation helpers ───────────────────────────────────────────────────────

  // "Go to Match" is an explicit entry: it enrols the person (match_join_venue) like Games → Match does.
  const goToMatch = useCallback(() => {
    if (!session) return;
    void joinMatchVenue(session.businessId, session.roomId);
    navigation.navigate('MatchHome', { businessId: session.businessId, businessName: session.businessName });
  }, [navigation, session]);

  const backToChat = useCallback(() => {
    if (session) navigation.navigate('ChatRoom', { id: session.roomId });
    else navigation.goBack();
  }, [navigation, session]);

  const confirmProfile = useCallback(async () => {
    await reload(); // the freshest photo status decides which screen follows
    setEditing(false);
    setConfirmed(true);
  }, [reload]);

  const statusColor = (status: MatchPhoto['status']) =>
    status === 'approved' ? c.success : status === 'rejected' ? c.danger : c.warning;

  // ── Pieces ───────────────────────────────────────────────────────────────────

  const header = (
    <View style={[styles.header, { borderBottomColor: c.borderSubtle }]}>
      <Pressable
        onPress={() => (view === 'preview' ? setPreviewing(false) : navigation.goBack())}
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
  );

  const venueName = session?.businessName ?? null;
  const labelFor = (kind: 'gender' | 'seeking', value: string | null) => (value ? t(`profile.v2.${kind}.${value}`) : t('profile.v2.complete.none'));

  /** A status row of the result screens: label on the left, "Listo" or its state on the right. */
  const statusRow = (label: string, value: string, ok: boolean) => (
    <View key={label} style={[styles.listRow, { borderBottomColor: c.borderSubtle }]}>
      <Text style={[styles.listLabel, { color: c.textPrimary }]}>{label}</Text>
      <View style={styles.listValue}>
        {ok ? <IconCheck size={16} color={c.success} /> : <IconClock size={16} color={c.warning} />}
        <Text style={[styles.listValueText, { color: ok ? c.success : c.textSecondary }]}>{value}</Text>
      </View>
    </View>
  );

  const resultList = (
    <View style={[styles.listCard, { backgroundColor: c.bgElevated, borderColor: c.borderSubtle }]}>
      {statusRow(t('profile.v2.list.profile'), summary.hasGender && summary.hasSeeking && summary.hasPhoto ? t('profile.v2.list.done') : t('profile.v2.list.missing'), summary.hasGender && summary.hasSeeking && summary.hasPhoto)}
      {statusRow(t('profile.v2.list.photos'), summary.hasApproved ? t('profile.v2.list.done') : summary.state === 'rejected' ? t('profile.v2.list.rejected') : t('profile.v2.list.reviewing'), summary.hasApproved)}
      {statusRow(t('profile.v2.list.venue', { venue: venueName ?? '' }), venueName !== null ? t('profile.v2.list.done') : t('profile.v2.list.outside'), venueName !== null)}
      {statusRow(t('profile.v2.list.games'), gamesEnabled ? t('profile.v2.list.done') : t('profile.v2.list.off'), gamesEnabled)}
    </View>
  );

  // ── Views ────────────────────────────────────────────────────────────────────

  if (mine.loading || !profile) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: c.bgBase }]}>
        {header}
        <View style={styles.center}>
          <Spinner color={c.brandText} />
        </View>
      </SafeAreaView>
    );
  }

  if (view === 'preview') {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: c.bgBase }]}>
        {header}
        <ScrollView contentContainerStyle={styles.content}>
          <View
            style={[styles.tag, { backgroundColor: palette.successTint }]}
            accessible
            accessibilityLabel={`${t('profile.v2.previewScreen.tag', { venue: venueName ?? t('profile.v2.list.outside') })}. ${progressA11y}`}
          >
            <Text style={[styles.tagText, { color: c.success }]}>
              {t('profile.v2.previewScreen.tag', { venue: venueName ?? t('profile.v2.list.outside') })}
            </Text>
          </View>
          {previewCard ? (
            <View style={styles.cardWrap}>
              <MatchCard card={previewCard} photoUrl={approved[0]?.url ?? null} interestNames={interestNames} />
            </View>
          ) : null}
          <View style={styles.buttonRow}>
            <Pressable
              onPress={() => {
                setPreviewing(false);
                setEditing(true);
                setConfirmed(false);
              }}
              accessibilityRole="button"
              style={[styles.secondaryBtn, styles.flex, { borderColor: c.brand }]}
            >
              <Text style={[styles.secondaryBtnText, { color: c.brandText }]}>{t('profile.v2.previewScreen.edit')}</Text>
            </Pressable>
            {session ? (
              <Pressable onPress={goToMatch} accessibilityRole="button" style={[styles.primaryBtn, styles.flex, { backgroundColor: c.brandFill }]}>
                <Text style={[styles.primaryBtnText, { color: palette.onBrand }]}>{t('profile.v2.previewScreen.goMatch')}</Text>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (view === 'result') {
    const rejected = summary.state === 'rejected';
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: c.bgBase }]}>
        {header}
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.bigTitle, { color: c.textPrimary }]} accessibilityRole="header">
            {rejected ? t('profile.v2.rejected.title') : t('profile.v2.reviewing.title')}
          </Text>
          <Text style={[styles.hint, { color: c.textSecondary }]}>{rejected ? t('profile.v2.rejected.sub') : t('profile.v2.reviewing.sub')}</Text>
          {!rejected ? <Spinner color={c.brandText} /> : null}
          {resultList}
          {!rejected ? <Text style={[styles.hint, { color: c.textSecondary }]}>{t('profile.v2.reviewing.note')}</Text> : null}
          {rejected ? (
            <>
              <Pressable
                onPress={() => {
                  setConfirmed(false);
                  setEditing(true);
                  handleAdd();
                }}
                accessibilityRole="button"
                style={[styles.primaryBtn, { backgroundColor: c.brandFill }]}
              >
                <Text style={[styles.primaryBtnText, { color: palette.onBrand }]}>{t('profile.v2.rejected.upload')}</Text>
              </Pressable>
              <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" style={styles.linkBtn}>
                <Text style={[styles.linkText, { color: c.textSecondary }]}>{t('profile.v2.rejected.notNow')}</Text>
              </Pressable>
            </>
          ) : (
            <Pressable onPress={backToChat} accessibilityRole="button" style={[styles.primaryBtn, { backgroundColor: c.brandFill }]}>
              <Text style={[styles.primaryBtnText, { color: palette.onBrand }]}>{t('profile.v2.reviewing.back')}</Text>
            </Pressable>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (view === 'complete') {
    const age = ageFromBirthYear(birthYear);
    const name = profile.display_name?.trim() || (profile.username ? `@${profile.username}` : '');
    const edit = () => {
      setEditing(true);
      setConfirmed(false);
    };
    const rows: Array<{ key: string; label: string; value: string }> = [
      ...(prefs.available
        ? [
            { key: 'gender', label: t('profile.v2.complete.rowGender'), value: labelFor('gender', prefs.gender) },
            { key: 'seeking', label: t('profile.v2.complete.rowSeeking'), value: labelFor('seeking', prefs.seeking) },
          ]
        : []),
      { key: 'age', label: t('profile.v2.complete.rowAge'), value: t('profile.v2.complete.ageValue', { min: ageMin ?? MIN_AGE, max: ageMax ?? MAX_AGE }) },
      { key: 'photos', label: t('profile.v2.complete.rowPhotos'), value: t('profile.v2.complete.photosOf', { count: photos.length, max: MAX_MATCH_PHOTOS }) },
      { key: 'interests', label: t('profile.v2.complete.rowInterests'), value: interestKeys.length > 0 ? interestKeys.map((k) => interestNames[k] ?? k).join(', ') : t('profile.v2.complete.none') },
    ];
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: c.bgBase }]}>
        {header}
        <ScrollView contentContainerStyle={styles.content}>
          <View
            style={[styles.banner, { backgroundColor: palette.successTint, borderColor: c.success }]}
            accessibilityRole="summary"
            accessible
            accessibilityLabel={`${t('profile.v2.complete.banner')} · ${venueName ? t('profile.v2.complete.bannerVenue', { venue: venueName }) : t('profile.v2.complete.bannerNoVenue')}. ${progressA11y}`}
          >
            <IconCheck size={20} color={c.success} />
            <Text style={[styles.bannerText, { color: c.success }]}>
              {t('profile.v2.complete.banner')} · {venueName ? t('profile.v2.complete.bannerVenue', { venue: venueName }) : t('profile.v2.complete.bannerNoVenue')}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            {approved[0]?.url ? <Image source={{ uri: approved[0].url }} style={styles.thumb} contentFit="cover" accessible={false} /> : <View style={[styles.thumb, { backgroundColor: c.bgElevated }]} />}
            <View style={styles.flex}>
              <Text style={[styles.summaryName, { color: c.textPrimary }]} numberOfLines={1}>
                {age !== null ? `${name}, ${age}` : name}
              </Text>
              <Text style={[styles.hint, { color: c.textSecondary }]}>{t('profile.v2.complete.photosApproved', { count: approved.length })}</Text>
            </View>
          </View>

          <Pressable onPress={() => setPreviewing(true)} accessibilityRole="button" style={[styles.secondaryBtn, { borderColor: c.brand }]}>
            <Text style={[styles.secondaryBtnText, { color: c.brandText }]}>{t('profile.v2.complete.preview')}</Text>
          </Pressable>

          <View style={[styles.listCard, { backgroundColor: c.bgElevated, borderColor: c.borderSubtle }]}>
            {rows.map((row) => (
              <Pressable key={row.key} onPress={edit} accessibilityRole="button" accessibilityLabel={`${row.label}: ${row.value}`} style={[styles.listRow, { borderBottomColor: c.borderSubtle }]}>
                <Text style={[styles.listLabel, { color: c.textPrimary }]}>{row.label}</Text>
                <Text style={[styles.listValueText, styles.rowValue, { color: c.textSecondary }]} numberOfLines={1}>{row.value}</Text>
              </Pressable>
            ))}
          </View>

          {session ? (
            <Pressable onPress={goToMatch} accessibilityRole="button" style={[styles.primaryBtn, { backgroundColor: c.brandFill }]}>
              <Text style={[styles.primaryBtnText, { color: palette.onBrand }]}>{t('profile.v2.complete.goMatch')}</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── edit ─────────────────────────────────────────────────────────────────────

  const missing = missingForConfirm(summary);
  const canConfirm = canConfirmMatchProfile(summary) && !busy;
  const optionRow = <T extends string>(title: string, options: readonly T[], value: T | null, onPick: (next: T) => void, labelKey: 'gender' | 'seeking') => (
    <View key={labelKey} style={styles.optionBlock}>
      <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>{title}</Text>
      <View style={styles.optionRow} accessibilityRole="radiogroup">
        {options.map((option) => {
          const active = option === value;
          return (
            <Pressable
              key={option}
              testID={`match-${labelKey}-${option}`}
              onPress={() => !busy && option !== value && onPick(option)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              style={[styles.optionChip, active ? { backgroundColor: c.brandFill, borderColor: c.brand } : { backgroundColor: c.bgElevated, borderColor: c.borderSubtle }]}
            >
              <Text maxFontSizeMultiplier={typeCap('compact')} style={[styles.optionText, { color: active ? palette.onBrand : c.textPrimary }]}>{t(`profile.v2.${labelKey}.${option}`)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bgBase }]}>
      {header}
      <ScrollView contentContainerStyle={styles.content}>
        <View accessible accessibilityLabel={progressA11y}>
          <Text style={[styles.progressText, { color: c.textSecondary }]}>{t('profile.v2.progress', { done: summary.done, total: summary.total })}</Text>
          <View style={[styles.track, { backgroundColor: c.bgElevated }]}>
            <View style={[styles.fill, { backgroundColor: c.brand, width: `${(summary.done / summary.total) * 100}%` }]} />
          </View>
        </View>

        {prefs.available ? (
          <>
            {optionRow(t('profile.v2.gender.title'), MATCH_GENDERS, prefs.gender, (g) => void savePrefs(g, prefs.seeking), 'gender')}
            {optionRow(t('profile.v2.seeking.title'), MATCH_SEEKINGS, prefs.seeking, (next) => void savePrefs(prefs.gender, next), 'seeking')}
          </>
        ) : null}

        {/* Age range */}
        <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>{t('profile.v2.ageTitle')}</Text>
        <View style={[styles.settingsCard, { backgroundColor: c.bgElevated, borderColor: c.borderSubtle }]}>
          <Text style={[styles.hint, { color: c.textSecondary }]}>{t('profile.settings.ageHint')}</Text>
          {ageMin == null || ageMax == null ? (
            <>
              <Text style={[styles.hint, { color: c.textSecondary }]}>{t('profile.settings.ageDefault')}</Text>
              <Pressable onPress={customizeAge} accessibilityRole="button" style={[styles.secondaryBtn, { borderColor: c.brand }]}>
                <Text style={[styles.secondaryBtnText, { color: c.brandText }]}>{t('profile.settings.ageCustomize')}</Text>
              </Pressable>
            </>
          ) : (
            (['min', 'max'] as const).map((which) => {
              const value = which === 'min' ? ageMin : ageMax;
              const label = which === 'min' ? t('profile.settings.ageMin') : t('profile.settings.ageMax');
              return (
                <View key={which} style={styles.stepperRow}>
                  <Text style={[styles.stepperLabel, { color: c.textPrimary }]}>{label}</Text>
                  <View style={styles.stepper}>
                    <Pressable onPress={() => changeAge(which, -1)} accessibilityRole="button" accessibilityLabel={`${t('profile.settings.ageDecrease')} ${label}`} style={[styles.stepBtn, { borderColor: c.borderSubtle }]}>
                      <IconMinus size={18} color={c.textPrimary} />
                    </Pressable>
                    <Text style={[styles.stepValue, { color: c.textPrimary }]} accessibilityLiveRegion="polite">{value}</Text>
                    <Pressable onPress={() => changeAge(which, 1)} accessibilityRole="button" accessibilityLabel={`${t('profile.settings.ageIncrease')} ${label}`} style={[styles.stepBtn, { borderColor: c.borderSubtle }]}>
                      <IconPlus size={18} color={c.textPrimary} />
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Photos */}
        <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>{t('profile.photos.title')}</Text>
        <Text style={[styles.hint, { color: c.textSecondary }]}>{t('profile.photos.hint', { max: MAX_MATCH_PHOTOS })}</Text>

        {photos.length === 0 && profile.avatar_url ? (
          <Pressable
            testID="match-use-profile-photo"
            onPress={copyProfilePhoto}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t('profile.v2.shortcutA11y')}
            style={[styles.shortcut, { borderColor: c.brand, backgroundColor: c.brandLight, opacity: busy ? 0.6 : 1 }]}
          >
            <Image source={{ uri: profile.avatar_url }} style={styles.shortcutThumb} contentFit="cover" accessible={false} />
            <View style={styles.flex}>
              <Text style={[styles.shortcutTitle, { color: c.textPrimary }]}>{t('profile.v2.shortcutTitle')}</Text>
              <Text style={[styles.hint, { color: c.textSecondary }]}>{t('profile.v2.shortcutSub')}</Text>
            </View>
            {busy ? <Spinner color={c.brandText} /> : null}
          </Pressable>
        ) : null}

        <View style={styles.grid}>
          {photos.map((photo, index) => (
            <Pressable
              key={photo.id}
              onPress={() => handlePhotoMenu(photo, index)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={t('profile.photos.tileA11y', { position: index + 1, status: t(`profile.photos.status.${photo.status}`) })}
              style={[styles.tile, { width: tile, height: tile * 1.25, backgroundColor: c.bgElevated }]}
            >
              {photo.url ? <Image source={{ uri: photo.url }} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} /> : null}
              {index === 0 ? (
                <View style={[styles.mainPill, { backgroundColor: c.brandFill }]}>
                  <Text style={[styles.statusText, { color: palette.onBrand }]}>{t('profile.v2.main')}</Text>
                </View>
              ) : null}
              <View style={[styles.statusPill, { backgroundColor: statusColor(photo.status) }]}>
                <Text style={[styles.statusText, { color: palette.onBrand }]}>{t(`profile.photos.status.${photo.status}`)}</Text>
              </View>
              {photo.status === 'rejected' ? (
                <View style={[styles.rejectedShade, { backgroundColor: palette.scrimMedium }]}>
                  <Text style={[styles.rejectedText, { color: palette.onImage }]}>{t('profile.photos.rejectedReason')}</Text>
                </View>
              ) : null}
            </Pressable>
          ))}
          {canAdd ? (
            <Pressable
              onPress={handleAdd}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={t('profile.photos.add')}
              style={[styles.tile, styles.addTile, { width: tile, height: tile * 1.25, borderColor: c.borderSubtle, backgroundColor: c.bgElevated }]}
            >
              {busy ? <Spinner color={c.brandText} /> : <IconPlus size={28} color={c.brandText} />}
            </Pressable>
          ) : null}
        </View>
        <Text style={[styles.hint, { color: c.textSecondary }]}>{t('profile.v2.tip')}</Text>

        {/* Interests (optional) */}
        <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>{t('profile.interests.title')}</Text>
        {interestKeys.length > 0 ? (
          <View style={styles.chipsRow}>
            {interestKeys.map((key) => (
              <View key={key} style={[styles.interestChip, { backgroundColor: c.bgElevated, borderColor: c.borderSubtle }]}>
                <Text maxFontSizeMultiplier={typeCap('caption')} style={[styles.interestChipText, { color: c.textPrimary }]}>{interestNames[key] ?? key}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <Pressable onPress={() => navigation.navigate('MatchInterests', {})} accessibilityRole="button" style={[styles.secondaryBtn, { borderColor: c.brand }]}>
          <Text style={[styles.secondaryBtnText, { color: c.brandText }]}>
            {interestKeys.length > 0 ? t('profile.v2.editInterests') : t('profile.v2.pickInterests', { max: MAX_MATCH_INTERESTS })}
          </Text>
        </Pressable>

        {/* New-people notification */}
        <View style={[styles.settingsCard, { backgroundColor: c.bgElevated, borderColor: c.borderSubtle }]}>
          <View style={styles.switchRow}>
            <View style={styles.switchTexts}>
              <Text style={[styles.settingLabel, { color: c.textPrimary }]}>{t('profile.settings.newPeople')}</Text>
              <Text style={[styles.hint, { color: c.textSecondary }]}>{t('profile.settings.newPeopleHint')}</Text>
            </View>
            <ThemedSwitch value={notifyNewPeople} onValueChange={toggleNotify} trackColor={{ false: c.borderSubtle, true: c.brand }} accessibilityLabel={t('profile.settings.newPeople')} />
          </View>
        </View>

        {/* Confirm */}
        <Pressable
          testID="match-confirm-profile"
          onPress={() => void confirmProfile()}
          disabled={!canConfirm}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canConfirm }}
          style={[styles.primaryBtn, { backgroundColor: c.brandFill, opacity: canConfirm ? 1 : 0.5 }]}
        >
          <Text style={[styles.primaryBtnText, { color: palette.onBrand }]}>{t('profile.v2.confirm')}</Text>
        </Pressable>
        {missing.length > 0 ? (
          <Text style={[styles.hint, styles.center_, { color: c.textSecondary }]}>
            {t('profile.v2.missingTitle')} {missing.map((m) => t(`profile.v2.missing.${m}`)).join(', ')}
          </Text>
        ) : null}
        <Text style={[styles.hint, styles.center_, { color: c.textSecondary }]}>{t('profile.v2.privacy')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
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
  center_: { textAlign: 'center' },
  content: { padding: SIDE_PADDING, gap: 12, paddingBottom: 48 },
  bigTitle: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginTop: 8 },
  hint: { fontSize: 13, lineHeight: 18 },
  progressText: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  optionBlock: { gap: 8 },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // Wraps to a second row (and the label wraps inside the chip) at large text; never a fixed height.
  optionChip: { flexGrow: 1, flexBasis: 'auto', maxWidth: '100%', minWidth: 96, minHeight: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 8 },
  optionText: { ...typeStyle('compact'), fontWeight: '600', textAlign: 'center' },
  cardWrap: { width: '100%', maxWidth: 360, alignSelf: 'center' },
  shortcut: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 12 },
  shortcutThumb: { width: 56, height: 56, borderRadius: 28 },
  shortcutTitle: { fontSize: 16, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  tile: { borderRadius: 14, overflow: 'hidden' },
  addTile: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed' },
  mainPill: { position: 'absolute', left: 6, top: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  statusPill: { position: 'absolute', left: 6, bottom: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  statusText: { fontSize: 11, fontWeight: '700' },
  rejectedShade: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 8 },
  rejectedText: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  primaryBtn: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryBtnText: { fontSize: 16, fontWeight: '800' },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderWidth: 1, borderRadius: 14 },
  secondaryBtnText: { fontSize: 15, fontWeight: '600' },
  linkBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linkText: { fontSize: 15 },
  buttonRow: { flexDirection: 'row', gap: 10 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  interestChip: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  interestChipText: { ...typeStyle('caption'), fontWeight: '600' },
  settingsCard: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  settingLabel: { fontSize: 15, fontWeight: '600' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepperLabel: { fontSize: 15 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepValue: { fontSize: 18, fontWeight: '700', minWidth: 32, textAlign: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchTexts: { flex: 1, gap: 2 },
  listCard: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  listRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 48, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  listLabel: { fontSize: 15, flexShrink: 1 },
  listValue: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  listValueText: { fontSize: 14, fontWeight: '600' },
  rowValue: { flexShrink: 1, textAlign: 'right' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 14 },
  bannerText: { flex: 1, fontSize: 14, fontWeight: '700' },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 64, height: 80, borderRadius: 12 },
  summaryName: { fontSize: 18, fontWeight: '700' },
  tag: { alignSelf: 'center', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  tagText: { fontSize: 13, fontWeight: '700' },
});
