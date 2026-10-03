import React, { useCallback, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { IconHeart, IconHeartFilled, IconMessageCircle } from '@tabler/icons-react-native';
import { useTranslation } from 'react-i18next';

import type { MegaphoneItem } from '../../services/megaphone';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { formatSocialTime } from '../../utils/formatSocialTime';
import { formatDistance } from '../../utils/distanceUnits';
import BusinessAvatar from './BusinessAvatar';

/** List padding (16 each side) the card has to fit inside. */
const LIST_HORIZONTAL_PADDING = 32;
const COLLAPSED_LINES = 4;
/** Heuristic: longer text, or more line breaks, probably needs "see more". */
const LONG_TEXT_CHARS = 180;

interface MegaphonePostCardProps {
  item: MegaphoneItem;
  onToggleLike: (item: MegaphoneItem) => void;
  onOpenComments: (item: MegaphoneItem) => void;
  onEnter: (item: MegaphoneItem) => void;
}

export default function MegaphonePostCard({
  item,
  onToggleLike,
  onOpenComments,
  onEnter,
}: MegaphonePostCardProps) {
  const colors = useThemeColors();
  const translation = useTranslation('offers');
  const socialTranslation = useTranslation('social');
  const { width: screenWidth } = useWindowDimensions();
  const mediaWidth = screenWidth - LIST_HORIZONTAL_PADDING;
  const mediaHeight = Math.round((mediaWidth * 5) / 4);

  const [photoIndex, setPhotoIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const body = item.body ?? '';
  const canExpand = body.length > LONG_TEXT_CHARS || body.split('\n').length > COLLAPSED_LINES;
  const liked = item.liked_by_me === true;

  const onPhotosScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      setPhotoIndex(Math.round(event.nativeEvent.contentOffset.x / mediaWidth));
    },
    [mediaWidth],
  );

  const renderPhoto = useCallback(({ item: uri }: ListRenderItemInfo<string>) => (
    <Image
      resizeMode="cover"
      source={{ uri }}
      style={{ backgroundColor: colors.bgElevated, height: mediaHeight, width: mediaWidth }}
    />
  ), [colors.bgElevated, mediaHeight, mediaWidth]);

  return (
    <View style={[styles.card, { backgroundColor: colors.bgSurface, borderColor: colors.borderSubtle }]}>
      <View style={styles.header}>
        <BusinessAvatar emoji={item.icon_emoji} logoUrl={item.logo_url} />
        <View style={styles.headerText}>
          <Text numberOfLines={1} style={[styles.businessName, { color: colors.textPrimary }]}>
            {item.business_name}
          </Text>
          <Text numberOfLines={1} style={[styles.meta, { color: colors.textTertiary }]}>
            {item.distance_miles !== null
              ? `${translation.t('distanceAway', { distance: formatDistance(item.distance_miles) })} · `
              : ''}
            {formatSocialTime(item.created_at, socialTranslation.i18n.language, socialTranslation.t)}
          </Text>
        </View>
      </View>

      {item.media_urls.length > 0 ? (
        <View>
          <FlatList
            data={item.media_urls}
            horizontal
            keyExtractor={(uri, index) => `${uri}:${index}`}
            onMomentumScrollEnd={onPhotosScrollEnd}
            pagingEnabled
            renderItem={renderPhoto}
            showsHorizontalScrollIndicator={false}
          />
          {item.media_urls.length > 1 ? (
            <View style={styles.dots}>
              {item.media_urls.map((uri, index) => (
                <View
                  key={`${uri}:${index}`}
                  style={[
                    styles.dot,
                    { backgroundColor: index === photoIndex ? colors.brand : colors.borderSubtle },
                  ]}
                />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {body ? (
        <View style={styles.bodyWrap}>
          <Text
            numberOfLines={expanded ? undefined : COLLAPSED_LINES}
            style={[styles.body, { color: colors.textPrimary }]}
          >
            {body}
          </Text>
          {canExpand ? (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setExpanded((value) => !value)}>
              <Text style={[styles.seeMore, { color: colors.textSecondary }]}>
                {translation.t(expanded ? 'seeLess' : 'seeMore')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityLabel={translation.t('likeA11y')}
          accessibilityRole="button"
          accessibilityState={{ selected: liked }}
          hitSlop={8}
          onPress={() => onToggleLike(item)}
          style={styles.action}
        >
          {liked ? (
            <IconHeartFilled size={24} color={colors.danger} />
          ) : (
            <IconHeart size={24} color={colors.textSecondary} strokeWidth={1.8} />
          )}
          <Text style={[styles.count, { color: colors.textSecondary }]}>{item.like_count ?? 0}</Text>
        </Pressable>

        <Pressable
          accessibilityLabel={translation.t('commentsA11y')}
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => onOpenComments(item)}
          style={styles.action}
        >
          <IconMessageCircle size={24} color={colors.textSecondary} strokeWidth={1.8} />
          <Text style={[styles.count, { color: colors.textSecondary }]}>{item.comment_count ?? 0}</Text>
        </Pressable>

        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.8}
          onPress={() => onEnter(item)}
          style={[styles.enterButton, { backgroundColor: colors.brand }]}
        >
          <Text style={[styles.enterText, { color: palette.bgSurfaceLight }]}>{translation.t('enter')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  header: { alignItems: 'center', flexDirection: 'row', gap: 10, padding: 12 },
  headerText: { flex: 1, gap: 1 },
  businessName: { fontSize: 14, fontWeight: '700' },
  meta: { fontSize: 12 },
  dots: { alignItems: 'center', flexDirection: 'row', gap: 6, justifyContent: 'center', paddingTop: 8 },
  dot: { borderRadius: 3, height: 6, width: 6 },
  bodyWrap: { gap: 4, paddingHorizontal: 12, paddingTop: 10 },
  body: { fontSize: 14, lineHeight: 20 },
  seeMore: { fontSize: 13, fontWeight: '600' },
  actions: { alignItems: 'center', flexDirection: 'row', gap: 18, padding: 12 },
  action: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  count: { fontSize: 13, fontWeight: '600' },
  enterButton: { borderRadius: 12, marginLeft: 'auto', paddingHorizontal: 18, paddingVertical: 9 },
  enterText: { fontSize: 14, fontWeight: '800' },
});
