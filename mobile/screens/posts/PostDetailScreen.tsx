import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import {
  IconArrowLeft,
  IconDots,
  IconFlag,
  IconHeart,
  IconHeartFilled,
  IconMapPin,
  IconMessageCircle,
  IconSend,
  IconTrash,
  IconX,
} from '@tabler/icons-react-native';

import type { MainStackParamList } from '../../navigation/AppNavigator';
import { useAuth } from '../../context/AuthContext';
import { useThemeColors } from '../../theme/colors';
import {
  addComment,
  deletePost,
  getComments,
  getLikeCount,
  getPostById,
  isPostLiked,
  likePost,
  reportPost,
  unlikePost,
  type CommentRow,
  type PostRow,
} from '../../services/posts';
import { getPublicProfile, type PublicProfileRow } from '../../services/users';
import BusinessAvatar from '../../components/megaphone/BusinessAvatar';
import { toUserMessage } from '../../utils/errors';
import { checkMessage } from '../../utils/messageFilter';

type DetailRoute = RouteProp<MainStackParamList, 'PostDetail'>;
type DetailNavigation = NativeStackNavigationProp<MainStackParamList, 'PostDetail'>;
const REPORT_REASONS = ['spam', 'harassment', 'inappropriate', 'impersonation', 'other'] as const;
const PHOTO_WIDTH = Dimensions.get('window').width;

function SheetRow({ label, color, borderColor, icon, onPress }: {
  label: string; color: string; borderColor: string; icon?: React.ReactNode; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.sheetRow, { borderBottomColor: borderColor }]} onPress={onPress} accessibilityRole="button">
      {icon}<Text style={[styles.sheetRowText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function PostDetailScreen(): React.JSX.Element {
  const c = useThemeColors();
  const { t, i18n } = useTranslation('feed');
  const navigation = useNavigation<DetailNavigation>();
  const { params } = useRoute<DetailRoute>();
  const { user } = useAuth();
  const [post, setPost] = useState<PostRow | null>(null);
  const [author, setAuthor] = useState<PublicProfileRow | null>(null);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [likeCount, setLikeCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const postRow = await getPostById(params.postId);
      if (!postRow) throw new Error(t('detail.notFound'));
      const [authorRow, commentRows, count, likedByMe] = await Promise.all([
        // Business posts show the business, never the owner's personal profile.
        postRow.business_id ? Promise.resolve(null) : getPublicProfile(postRow.user_id),
        getComments(postRow.id),
        getLikeCount(postRow.id),
        user?.id ? isPostLiked(postRow.id, user.id) : Promise.resolve(false),
      ]);
      setPost(postRow);
      setAuthor(authorRow);
      setComments(commentRows);
      setLikeCount(count);
      setLiked(likedByMe);
    } catch (error) {
      Alert.alert(t('detail.loadFailedTitle'), toUserMessage(error, 'feed:detail.loadFailed'));
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [navigation, params.postId, t, user?.id]);

  useEffect(() => { void load(); }, [load]);

  const toggleLike = useCallback(async () => {
    if (!post || !user?.id || busy) return;
    const next = !liked;
    setLiked(next);
    setLikeCount((value) => Math.max(0, value + (next ? 1 : -1)));
    try {
      if (next) await likePost(post.id, user.id); else await unlikePost(post.id, user.id);
    } catch {
      setLiked(!next);
      setLikeCount((value) => Math.max(0, value + (next ? -1 : 1)));
      Alert.alert(t('detail.actionFailedTitle'), t('detail.likeFailed'));
    }
  }, [busy, liked, post, t, user?.id]);

  const sendComment = useCallback(async () => {
    const body = comment.trim();
    if (!post || !user?.id || !body || busy) return;
    if (!checkMessage(body).allowed) {
      Alert.alert(t('common:contentFilter.title'), t('common:contentFilter.blocked'));
      return; // the comment stays in the box
    }
    setBusy(true);
    try {
      await addComment(post.id, user.id, body);
      setComment('');
      setComments(await getComments(post.id));
    } catch {
      Alert.alert(t('detail.actionFailedTitle'), t('detail.commentFailed'));
    } finally { setBusy(false); }
  }, [busy, comment, post, t, user?.id]);

  const confirmDelete = useCallback(() => {
    if (!post || !user?.id) return;
    setMenuVisible(false);
    Alert.alert(t('detail.deleteTitle'), t('detail.deleteMessage'), [
      { text: t('detail.cancel'), style: 'cancel' },
      { text: t('detail.delete'), style: 'destructive', onPress: () => {
        setBusy(true);
        void deletePost(post.id, user.id)
          .then(() => navigation.goBack())
          .catch(() => Alert.alert(t('detail.actionFailedTitle'), t('detail.deleteFailed')))
          .finally(() => setBusy(false));
      } },
    ]);
  }, [navigation, post, t, user?.id]);

  const submitReport = useCallback(async (reason: typeof REPORT_REASONS[number]) => {
    if (!post || !user?.id || busy) return;
    setBusy(true);
    try {
      await reportPost(user.id, post.id, post.user_id, reason);
      setReportVisible(false);
      Alert.alert(t('detail.reportThanksTitle'), t('detail.reportThanksMessage'));
    } catch {
      Alert.alert(t('detail.actionFailedTitle'), t('detail.reportFailed'));
    } finally { setBusy(false); }
  }, [busy, post, t, user?.id]);

  if (loading || !post) {
    return <View style={[styles.center, { backgroundColor: c.bgBase }]}><ActivityIndicator color={c.brand} /></View>;
  }

  const isOwner = post.user_id === user?.id;
  const business = post.business_id ? post.business ?? null : null;
  const authorName = business?.name || author?.display_name?.trim() || author?.username || t('post.unknownAuthor');
  const date = new Date(post.created_at).toLocaleString(i18n.language);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bgBase }]}>
      <View style={[styles.header, { borderBottomColor: c.borderSubtle }]}>
        <TouchableOpacity testID="back-button" style={styles.iconButton} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel={t('detail.backA11y')}>
          <IconArrowLeft size={24} color={c.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.textPrimary }]}>{t('detail.title')}</Text>
        <TouchableOpacity style={styles.iconButton} onPress={() => setMenuVisible(true)} accessibilityRole="button" accessibilityLabel={t('detail.moreA11y')}>
          <IconDots size={24} color={c.textPrimary} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled">
          <View style={styles.authorRow}>
            {post.business_id ? <BusinessAvatar emoji={business?.icon_emoji ?? null} logoUrl={business?.logo_url ?? null} size={42} /> : author?.avatar_url ? <Image source={{ uri: author.avatar_url }} style={[styles.avatar, { backgroundColor: c.bgSurface }]} /> : <View style={[styles.avatar, { backgroundColor: c.bgSurface }]} />}
            <View style={styles.authorCopy}>
              <Text style={[styles.authorName, { color: c.textPrimary }]}>{authorName}</Text>
              <Text style={[styles.date, { color: c.textTertiary }]}>{date}</Text>
            </View>
          </View>

          {post.media_urls.length > 0 ? (
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} accessibilityLabel={t('post.photosA11y')}>
              {post.media_urls.map((url, index) => <Image key={url} source={{ uri: url }} style={[styles.photo, { backgroundColor: c.bgSurface }]} resizeMode="cover" accessibilityLabel={t('post.photoA11y', { index: index + 1, total: post.media_urls.length })} />)}
            </ScrollView>
          ) : null}

          <View style={styles.content}>
            {post.caption ? <Text style={[styles.caption, { color: c.textPrimary }]}>{post.caption}</Text> : null}
            {post.geotag ? <View style={styles.placeRow}><IconMapPin size={17} color={c.textSecondary} /><Text style={[styles.place, { color: c.textSecondary }]}>{post.geotag}</Text></View> : null}
            <View style={styles.engagementRow}>
              <TouchableOpacity style={styles.engagementButton} onPress={() => void toggleLike()} accessibilityRole="button" accessibilityLabel={liked ? t('post.unlikeA11y') : t('post.likeA11y')}>
                {liked ? <IconHeartFilled size={23} color={c.danger} /> : <IconHeart size={23} color={c.textSecondary} />}
                <Text style={[styles.engagementText, { color: c.textSecondary }]}>{likeCount}</Text>
              </TouchableOpacity>
              <View style={styles.engagementButton}><IconMessageCircle size={22} color={c.textSecondary} /><Text style={[styles.engagementText, { color: c.textSecondary }]}>{comments.length}</Text></View>
            </View>

            <Text style={[styles.commentsTitle, { color: c.textPrimary }]}>{t('detail.comments')}</Text>
            {comments.length === 0 ? <Text style={[styles.emptyComments, { color: c.textTertiary }]}>{t('detail.noComments')}</Text> : comments.map((item) => (
              <View key={item.id} style={[styles.commentRow, { borderBottomColor: c.borderSubtle }]}>
                <Text style={[styles.commentAuthor, { color: c.textPrimary }]}>{item.author?.display_name || item.author?.username || t('post.unknownAuthor')}</Text>
                <Text style={[styles.commentBody, { color: c.textSecondary }]}>{item.body}</Text>
                <Text style={[styles.commentDate, { color: c.textTertiary }]}>{new Date(item.created_at).toLocaleString(i18n.language)}</Text>
              </View>
            ))}
          </View>
        </ScrollView>

        <View style={[styles.composer, { backgroundColor: c.bgBase, borderTopColor: c.borderSubtle }]}>
          <TextInput value={comment} onChangeText={setComment} maxLength={1000} editable={!busy} placeholder={t('detail.commentPlaceholder')} placeholderTextColor={c.textTertiary} style={[styles.commentInput, { color: c.textPrimary, backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]} />
          <TouchableOpacity style={[styles.sendButton, { backgroundColor: comment.trim() && !busy ? c.brand : c.bgSurface }]} testID="comment-send" disabled={!comment.trim() || busy} onPress={() => void sendComment()} accessibilityRole="button" accessibilityLabel={t('detail.sendCommentA11y')}>
            {busy ? <ActivityIndicator size="small" color={c.textPrimary} /> : <IconSend size={20} color={comment.trim() ? c.bgBase : c.textTertiary} />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={menuVisible} transparent animationType="slide" onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={[styles.backdrop, { backgroundColor: c.scrim }]} onPress={() => setMenuVisible(false)} />
        <View style={[styles.sheet, { backgroundColor: c.bgElevated, borderColor: c.borderSubtle }]}>
          <View style={styles.sheetHandleWrap}><View style={[styles.sheetHandle, { backgroundColor: c.borderSubtle }]} /></View>
          {isOwner ? <SheetRow label={t('detail.delete')} color={c.danger} borderColor={c.borderSubtle} icon={<IconTrash size={20} color={c.danger} />} onPress={confirmDelete} /> : <SheetRow label={t('detail.reportPost')} color={c.danger} borderColor={c.borderSubtle} icon={<IconFlag size={20} color={c.danger} />} onPress={() => { setMenuVisible(false); setReportVisible(true); }} />}
          <SheetRow label={t('detail.cancel')} color={c.textSecondary} borderColor={c.borderSubtle} icon={<IconX size={20} color={c.textSecondary} />} onPress={() => setMenuVisible(false)} />
        </View>
      </Modal>

      <Modal visible={reportVisible} transparent animationType="slide" onRequestClose={() => setReportVisible(false)}>
        <Pressable style={[styles.backdrop, { backgroundColor: c.scrim }]} onPress={() => setReportVisible(false)} />
        <View style={[styles.sheet, { backgroundColor: c.bgElevated, borderColor: c.borderSubtle }]}>
          <View style={styles.sheetHandleWrap}><View style={[styles.sheetHandle, { backgroundColor: c.borderSubtle }]} /></View>
          <Text style={[styles.sheetTitle, { color: c.textPrimary }]}>{t('detail.reportTitle')}</Text>
          {REPORT_REASONS.map((reason) => <SheetRow key={reason} label={t(`detail.reportReasons.${reason}`)} color={c.textPrimary} borderColor={c.borderSubtle} onPress={() => void submitReport(reason)} />)}
          <SheetRow label={t('detail.cancel')} color={c.textSecondary} borderColor={c.borderSubtle} onPress={() => setReportVisible(false)} />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 }, flex: { flex: 1 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth },
  iconButton: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }, headerTitle: { fontSize: 17, fontWeight: '800' },
  authorRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 }, avatar: { width: 42, height: 42, borderRadius: 21 }, authorCopy: { flex: 1 },
  authorName: { fontSize: 15, fontWeight: '700' }, date: { marginTop: 2, fontSize: 12 }, photo: { width: PHOTO_WIDTH, aspectRatio: 1 },
  content: { paddingHorizontal: 16, paddingVertical: 14 }, caption: { fontSize: 15, lineHeight: 22 }, placeRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 }, place: { fontSize: 13 },
  engagementRow: { flexDirection: 'row', gap: 22, marginTop: 16 }, engagementButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }, engagementText: { fontSize: 14, fontWeight: '700' },
  commentsTitle: { marginTop: 14, fontSize: 17, fontWeight: '800' }, emptyComments: { marginTop: 10, fontSize: 14 },
  commentRow: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth }, commentAuthor: { fontSize: 13, fontWeight: '700' }, commentBody: { marginTop: 3, fontSize: 14, lineHeight: 20 }, commentDate: { marginTop: 5, fontSize: 11 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderTopWidth: StyleSheet.hairlineWidth },
  commentInput: { flex: 1, minHeight: 42, maxHeight: 100, borderRadius: 21, borderWidth: 1, paddingHorizontal: 15, paddingVertical: 9 }, sendButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }, sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingBottom: 30 },
  sheetHandleWrap: { height: 28, alignItems: 'center', justifyContent: 'center' }, sheetHandle: { width: 42, height: 5, borderRadius: 3 }, sheetTitle: { fontSize: 17, fontWeight: '800', paddingBottom: 10 },
  sheetRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth }, sheetRowText: { flex: 1, fontSize: 15, fontWeight: '600' },
});
