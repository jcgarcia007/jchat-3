/**
 * JChat 3.0 — "It's a match!" (Fase D4)
 *
 * Both photos, a prominent Follow button (a mutual follow makes the ephemeral chat permanent),
 * three venue icebreakers that are INSERTED into the message field (never sent on their own),
 * "Send message" (opens the DM by conversation_id with the text pre-filled) and "Keep exploring".
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { IconHeartFilled, IconUser } from '@tabler/icons-react-native';

import type { MainStackParamList } from '../../navigation/AppNavigator';
import { useAuth } from '../../context/AuthContext';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { useFollowSystem } from '../../hooks/useFollowSystem';
import { fetchMyMatchPhotos, signedPhotoUrls } from '../../services/matchProfile';
import { cardName } from '../../services/matchTypes';
import { useRequireMatchPresence } from '../../hooks/useRequireMatchPresence';

type Nav = NativeStackNavigationProp<MainStackParamList, 'MatchItsAMatch'>;

const ICEBREAKER_KEYS = ['drinking', 'firstTime', 'whatBroughtYou'] as const;

export default function MatchItsAMatchScreen() {
  const c = useThemeColors();
  const { t } = useTranslation('match');
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<MainStackParamList, 'MatchItsAMatch'>>();
  const { user } = useAuth();
  const { other } = params;
  useRequireMatchPresence(params.businessId, 'active');
  const follow = useFollowSystem(other.id);

  const [myPhoto, setMyPhoto] = useState<string | null>(null);
  const [theirPhoto, setTheirPhoto] = useState<string | null>(null);
  const [text, setText] = useState('');
  const businessName = params.businessName ?? '';
  const name = cardName(other) ?? t('card.unknownName');

  useEffect(() => {
    let alive = true;
    void (async () => {
      const theirPath = other.photos[0];
      const [mine, theirs] = await Promise.all([
        user?.id ? fetchMyMatchPhotos(user.id).catch(() => []) : Promise.resolve([]),
        theirPath ? signedPhotoUrls([theirPath]) : Promise.resolve({} as Record<string, string>),
      ]);
      if (!alive) return;
      setMyPhoto(mine.find((p) => p.status === 'approved')?.url ?? null);
      setTheirPhoto(theirPath ? (theirs[theirPath] ?? null) : null);
    })();
    return () => {
      alive = false;
    };
  }, [user?.id, other.photos]);

  const sendMessage = useCallback(() => {
    if (!params.conversationId) return;
    navigation.navigate('DMs', {
      screen: 'DMChat',
      params: { conversationId: params.conversationId, otherUserId: other.id, prefill: text.trim() || undefined },
    });
  }, [navigation, params.conversationId, other.id, text]);

  const followLabel =
    follow.relation === 'following'
      ? t('itsAMatch.following')
      : follow.relation === 'requested'
        ? t('itsAMatch.requested')
        : t('itsAMatch.follow', { name });
  const canFollow = follow.relation === 'none' && !follow.busy && !follow.loading;

  const photo = (url: string | null) =>
    url ? (
      <Image source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit="cover" />
    ) : (
      <View style={[StyleSheet.absoluteFill, styles.photoPlaceholder, { backgroundColor: c.bgElevated }]}>
        <IconUser size={36} color={c.textTertiary} />
      </View>
    );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bgBase }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.photos}>
            <View style={[styles.photo, { borderColor: c.brand }]}>{photo(myPhoto)}</View>
            <View style={[styles.heart, { backgroundColor: c.brand }]}>
              <IconHeartFilled size={22} color={palette.onBrand} />
            </View>
            <View style={[styles.photo, { borderColor: c.brand }]}>{photo(theirPhoto)}</View>
          </View>

          <Text style={[styles.title, { color: c.textPrimary }]} accessibilityRole="header">
            {t('itsAMatch.title')}
          </Text>
          <Text style={[styles.subtitle, { color: c.textSecondary }]}>{t('itsAMatch.subtitle', { name })}</Text>

          {/* Follow — prominent: a mutual follow keeps this chat after you leave */}
          <Pressable
            onPress={() => void follow.follow()}
            disabled={!canFollow}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canFollow }}
            style={[
              styles.followBtn,
              { backgroundColor: canFollow ? c.brand : c.bgElevated, borderColor: c.brand },
            ]}
          >
            {follow.busy ? (
              <ActivityIndicator color={palette.onBrand} />
            ) : (
              <Text style={[styles.followText, { color: canFollow ? palette.onBrand : c.brand }]}>{followLabel}</Text>
            )}
          </Pressable>
          <Text style={[styles.followHint, { color: c.textSecondary }]}>{t('itsAMatch.followHint')}</Text>

          {/* Icebreakers: inserted into the field, never sent automatically */}
          <Text style={[styles.sectionLabel, { color: c.textPrimary }]}>{t('itsAMatch.icebreakers')}</Text>
          <View style={styles.chips}>
            {ICEBREAKER_KEYS.map((key) => {
              const phrase = t(`itsAMatch.icebreaker.${key}`, { business: businessName });
              return (
                <Pressable
                  key={key}
                  onPress={() => setText(phrase)}
                  accessibilityRole="button"
                  accessibilityLabel={phrase}
                  style={[styles.chip, { borderColor: c.borderSubtle, backgroundColor: c.bgElevated }]}
                >
                  <Text style={[styles.chipText, { color: c.textPrimary }]}>{phrase}</Text>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t('itsAMatch.placeholder')}
            placeholderTextColor={c.textTertiary}
            multiline
            maxLength={500}
            style={[styles.input, { color: c.textPrimary, borderColor: c.borderSubtle, backgroundColor: c.bgElevated }]}
            accessibilityLabel={t('itsAMatch.placeholder')}
          />

          <Pressable
            onPress={sendMessage}
            disabled={!params.conversationId}
            accessibilityRole="button"
            style={[styles.sendBtn, { borderColor: c.brand, opacity: params.conversationId ? 1 : 0.5 }]}
          >
            <Text style={[styles.sendText, { color: c.brand }]}>{t('itsAMatch.sendMessage')}</Text>
          </Pressable>

          <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" style={styles.keepBtn}>
            <Text style={[styles.keepText, { color: c.textSecondary }]}>{t('itsAMatch.keepExploring')}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: 24, gap: 14, alignItems: 'center' },
  photos: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 0, marginTop: 8 },
  photo: { width: 120, height: 160, borderRadius: 20, overflow: 'hidden', borderWidth: 3 },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  heart: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: -20,
    zIndex: 1,
  },
  title: { fontSize: 30, fontWeight: '900', textAlign: 'center' },
  subtitle: { fontSize: 15, textAlign: 'center', lineHeight: 21 },
  followBtn: {
    alignSelf: 'stretch',
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followText: { fontSize: 17, fontWeight: '800' },
  followHint: { fontSize: 12, textAlign: 'center', lineHeight: 17 },
  sectionLabel: { alignSelf: 'flex-start', fontSize: 14, fontWeight: '700', marginTop: 6 },
  chips: { alignSelf: 'stretch', gap: 8 },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 14, borderWidth: 1 },
  chipText: { fontSize: 14 },
  input: {
    alignSelf: 'stretch',
    minHeight: 56,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  sendBtn: {
    alignSelf: 'stretch',
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: { fontSize: 16, fontWeight: '700' },
  keepBtn: { minHeight: 44, justifyContent: 'center' },
  keepText: { fontSize: 15 },
});
