/**
 * JChat 3.0 — ProfileSheetScreen: the profile opened ON TOP of the chat (route `ProfileSheet`, a transparentModal).
 * The chat stays mounted behind it — no remount, same Realtime channels, same scroll, same venue session — so closing
 * the sheet leaves it exactly as it was. The content is the same ProfileScreen the Profile tab uses (mine, or
 * another person's when `userId` is given), so nothing is duplicated.
 *
 * While it is open: the venue session counts the chat's new messages ("💬 n mensajes nuevos en {local} ↓", tap →
 * back to the chat) and a direct message that arrives shows a short notice that opens that conversation.
 */

import React, { useCallback, useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../navigation/AppNavigator';
import { useVenueSession } from '../../context/VenueSessionContext';
import { useIncomingDmNotice, type IncomingDmNotice } from '../../hooks/useIncomingDmNotice';
import { DmNotice } from '../../components/profile/DmNotice';
import { NewMessagesPill } from '../../components/profile/NewMessagesPill';
import { ProfileSheetFrame } from '../../components/profile/ProfileSheetFrame';
import ProfileScreen from './ProfileScreen';

export default function ProfileSheetScreen(): React.ReactElement {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const venue = useVenueSession();
  const { setChatCovered } = venue;
  const { notice, dismiss } = useIncomingDmNotice(true);

  // The chat behind is covered while the sheet is open: its new messages count as unread; closing resets it.
  useEffect(() => {
    setChatCovered(true);
    return () => setChatCovered(false);
  }, [setChatCovered]);

  const close = useCallback(() => navigation.goBack(), [navigation]);

  const openNotice = useCallback(
    (n: IncomingDmNotice) => {
      dismiss();
      navigation.navigate('DMs', { screen: 'DMChat', params: { conversationId: n.conversationId, otherUserId: n.senderId } });
    },
    [dismiss, navigation],
  );

  const unread = venue.session ? venue.unreadMessages : 0;

  return (
    <ProfileSheetFrame
      onClose={close}
      overlay={
        <>
          {venue.session ? <NewMessagesPill count={unread} business={venue.session.businessName} onPress={close} /> : null}
          {notice ? <DmNotice notice={notice} extraTop={unread > 0 ? 44 : 0} onOpen={openNotice} onDismiss={dismiss} /> : null}
        </>
      }
    >
      <ProfileScreen />
    </ProfileSheetFrame>
  );
}
