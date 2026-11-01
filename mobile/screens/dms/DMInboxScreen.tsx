import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { IconArrowLeft } from '@tabler/icons-react-native';

import ConversationList from '../../components/dms/ConversationList';
import type { DMStackParamList } from '../../navigation/DMStack';
import type { ConversationPreview } from '../../services/dms';
import { useThemeColors } from '../../theme/colors';

type InboxNavigation = NativeStackNavigationProp<DMStackParamList, 'DMInbox'>;

export default function DMInboxScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<InboxNavigation>();
  const translation = useTranslation('social');
  const commonTranslation = useTranslation('common');

  const openConversation = useCallback((conversation: ConversationPreview) => {
    navigation.navigate('DMChat', {
      conversationId: conversation.id,
      otherUserId: conversation.otherUser.id,
    });
  }, [navigation]);

  return (
    <View style={[styles.root, { backgroundColor: colors.bgBase, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
        <Pressable
          accessibilityLabel={commonTranslation.t('back')}
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <IconArrowLeft size={24} color={colors.textPrimary} strokeWidth={2} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          {translation.t('inbox.title')}
        </Text>
      </View>
      <ConversationList onConversationPress={openConversation} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  headerTitle: { fontSize: 22, fontWeight: '700' },
});
