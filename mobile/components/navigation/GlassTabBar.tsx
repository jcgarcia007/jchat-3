import React from 'react';
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { IconMap, IconUser } from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import PostButton from './PostButton';
import type { GlassTabBarProps } from './GlassTabBar.types';

const BAR_HEIGHT = 70;
const BAR_SIDE = 16;
const BAR_BOTTOM = 26;

export default function GlassTabBar({ state, navigation }: GlassTabBarProps) {
  const colors = useThemeColors();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const translation = useTranslation('common');

  return (
    <View
      style={[
        styles.bar,
        {
          bottom: BAR_BOTTOM + insets.bottom,
        },
      ]}
    >
      <BlurView
        intensity={72}
        tint={scheme === 'dark' ? 'dark' : 'light'}
        style={[styles.blur, { borderColor: colors.glassBorder }]}
      >
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassBackground }]}
        />
      </BlurView>
      <View style={styles.tabs}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const isMap = route.name === 'Map';
          const Icon = isMap ? IconMap : IconUser;
          const label = translation.t(isMap ? 'tabs.map' : 'tabs.profile');

          return (
            <Pressable
              key={route.key}
              accessibilityLabel={label}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
              }}
              style={[styles.tab, index === 0 ? styles.leftTab : styles.rightTab]}
            >
              <Icon size={24} color={focused ? colors.brand : colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.label, { color: focused ? colors.brand : colors.textSecondary }]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.postButton}>
        <PostButton
          accessibilityLabel={translation.t('tabs.post')}
          onPress={() => navigation.navigate('CreatePost')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: BAR_SIDE,
    right: BAR_SIDE,
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
  },
  blur: {
    ...StyleSheet.absoluteFill,
    borderRadius: BAR_HEIGHT / 2,
    borderWidth: 1,
    overflow: 'hidden',
  },
  tabs: { flex: 1, flexDirection: 'row' },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  leftTab: { paddingRight: 42 },
  rightTab: { paddingLeft: 42 },
  label: { fontSize: 11, fontWeight: '600' },
  postButton: {
    position: 'absolute',
    top: -46,
    left: '50%',
    marginLeft: -49,
  },
});
