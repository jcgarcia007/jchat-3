import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { IconArrowLeft } from '@tabler/icons-react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import WebView from 'react-native-webview';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import type { MainStackParamList } from '../../navigation/AppNavigator';

type WebRoute = RouteProp<MainStackParamList, 'MenuWebPreview'>;
type WebNav = NativeStackNavigationProp<MainStackParamList, 'MenuWebPreview'>;

export default function MenuWebPreviewScreen() {
  const c = useThemeColors();
  const navigation = useNavigation<WebNav>();
  const route = useRoute<WebRoute>();
  const { slug, businessName } = route.params;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const uri = `https://jchat.cloud/m/${slug}`;

  const handleRetry = () => {
    setError(false);
    setRetryKey((k) => k + 1);
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bgBase }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: c.bgSurface, borderBottomColor: c.borderSubtle }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.btn, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityRole="button"
          hitSlop={8}
        >
          <IconArrowLeft size={24} color={c.textPrimary} strokeWidth={2} />
        </Pressable>
        <Text style={[styles.title, { color: c.textPrimary }]} numberOfLines={1}>
          {businessName ?? 'Vista web (beta)'}
        </Text>
        {/* Spacer to keep title centered */}
        <View style={styles.btn} />
      </View>

      {/* Content */}
      {error ? (
        <View style={[styles.center, { backgroundColor: c.bgBase }]}>
          <Text style={[styles.errorText, { color: c.textSecondary }]}>
            No se pudo cargar el menú.
          </Text>
          <Pressable
            onPress={handleRetry}
            style={[styles.retryBtn, { backgroundColor: palette.brand }]}
          >
            <Text style={styles.retryBtnText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <WebView
            key={retryKey}
            source={{ uri }}
            style={{ flex: 1 }}
            onLoadStart={() => { setLoading(true); setError(false); }}
            onLoadEnd={() => setLoading(false)}
            onError={() => { setLoading(false); setError(true); }}
          />
          {loading && (
            <View style={[styles.loadingOverlay, { backgroundColor: c.bgBase }]}>
              <ActivityIndicator size="large" color={palette.brand} />
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 4,
  },
  btn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 16, fontWeight: '600', textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  errorText: { fontSize: 15 },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
