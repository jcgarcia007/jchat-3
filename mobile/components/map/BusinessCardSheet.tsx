/**
 * JChat 3.0 — the business card as a bottom sheet, for screens other than the Map (Offers: "Ver local").
 *
 * The same BusinessPreviewCard the map pin opens. Without a position (`userCoords` null) the card gets `inside_radius = null`: it shows no warning and the
 * server decides on entry; with one, outside the venue's radius "Entrar al chat" is disabled and the card says why. "Entrar al chat" still goes through
 * the chat's own gate once inside. The card owns the only close button; a tap on the dimmed part closes it too.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Linking, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BusinessPreviewCard from './BusinessPreviewCard';
import { AppModal } from '../common/AppModal';
import ReservationScreen from '../../screens/reservations/ReservationScreen';
import type { MainStackParamList } from '../../navigation/AppNavigator';
import { haversineMeters } from '../../services/geofence';
import { resolveMainRoomId, type CardBusiness } from '../../services/businesses';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { formatMeters } from '../../utils/businessCard';
import { usesKilometers } from '../../utils/distanceUnits';
import { shareContent } from '../../utils/shareContent';

interface Props {
  /** The business to show; null = closed. */
  business: CardBusiness | null;
  userCoords: { lat: number; lng: number } | null;
  onClose: () => void;
}

export default function BusinessCardSheet({ business, userCoords, onClose }: Props): React.ReactElement {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const [reserveFor, setReserveFor] = useState<string | null>(null);

  const geo = useMemo(() => {
    if (!business || !userCoords) return { distance_m: undefined, distance: undefined, inside_radius: null as boolean | null };
    const distance_m = haversineMeters(userCoords.lat, userCoords.lng, business.lat, business.lng);
    const radius = business.geofence_radius_m;
    return {
      distance_m,
      distance: formatMeters(distance_m, usesKilometers()),
      inside_radius: typeof radius === 'number' && radius > 0 ? distance_m <= radius : null,
    };
  }, [business, userCoords]);

  const handleNavigate = useCallback((lat: number, lng: number) => {
    const url = Platform.select({
      ios: `http://maps.apple.com/?daddr=${lat},${lng}`,
      android: `geo:0,0?q=${lat},${lng}`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
    });
    void Linking.openURL(url);
  }, []);

  return (
    <>
      <AppModal visible={business !== null} transparent animationType="slide" onRequestClose={onClose}>
        <View style={styles.backdrop}>
          <TouchableOpacity accessible={false} style={styles.dismiss} activeOpacity={1} onPress={onClose} />
          <View style={[styles.body, { backgroundColor: c.bgBase, paddingBottom: insets.bottom + 8 }]}>
            {business ? (
              <BusinessPreviewCard
                business={{
                  id: business.id, name: business.name, category: business.category,
                  icon_emoji: business.icon_emoji, icon_url: business.icon_url, logo_url: business.logo_url, cover_url: business.cover_url, hours: business.hours,
                  address: business.address, lat: business.lat, lng: business.lng,
                  description: business.description, geofence_radius_m: business.geofence_radius_m,
                  distance: geo.distance, distance_m: geo.distance_m,
                }}
                inside_radius={geo.inside_radius}
                onClose={onClose}
                onOffers={onClose}
                onReserve={(businessId) => {
                  onClose();
                  setReserveFor(businessId);
                }}
                onEnterChat={(businessId) => {
                  void (async () => {
                    const roomId = await resolveMainRoomId(businessId);
                    onClose();
                    navigation.navigate('ChatRoom', { id: roomId ?? businessId });
                  })();
                }}
                onViewMenu={(id) => {
                  onClose();
                  navigation.navigate('Menu', { businessId: id, businessName: business.name });
                }}
                onNavigate={handleNavigate}
                onShare={() => {
                  const url = `https://jchat.cloud/b/${business.slug ?? business.id}`;
                  void shareContent({ message: `${business.name} — ${url}`, url });
                }}
              />
            ) : null}
          </View>
        </View>
      </AppModal>

      <AppModal visible={reserveFor !== null} animationType="slide" onRequestClose={() => setReserveFor(null)}>
        <View style={{ flex: 1, backgroundColor: c.bgBase, paddingTop: insets.top, paddingBottom: insets.bottom }}>
          {reserveFor !== null ? (
            <ReservationScreen
              businessId={reserveFor}
              onSuccess={() => { /* the form shows its own confirmation; Done calls onCancel */ }}
              onCancel={() => setReserveFor(null)}
              onViewMine={() => { setReserveFor(null); navigation.navigate('MyReservations'); }}
            />
          ) : null}
        </View>
      </AppModal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: palette.scrim },
  dismiss: { flex: 1 },
  body: { borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', maxHeight: '90%' },
});
