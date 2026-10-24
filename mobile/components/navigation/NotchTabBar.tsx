import React, { useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  type LayoutChangeEvent,
} from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import Svg, { Defs, FeGaussianBlur, Filter, Path } from 'react-native-svg';
import {
  IconMap,
  IconMessageCircle,
  IconRadar2,
  IconSpeakerphone,
} from '@tabler/icons-react-native';
import { useTranslation } from 'react-i18next';

import { useUnreadBadge } from '../../hooks/useUnreadBadge';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import ProfileTabAvatar from './ProfileTabAvatar';

export const BAR_HEIGHT = 68;
const BAR_RADIUS = 34;
const NOTCH_WIDTH = 104;
const NOTCH_DEPTH = 34;
/** Android has no drop shadow on a view without a background, so the shadow is a second, blurred copy of the path. */
const SHADOW_OFFSET_Y = 4;
const SHADOW_BLUR = 6;
const SHADOW_PAD = 24;
const IS_IOS = Platform.OS === 'ios';

function notchPath(width: number): string {
  const center = width / 2;
  const notchLeft = center - NOTCH_WIDTH / 2;
  const notchRight = center + NOTCH_WIDTH / 2;
  return [
    `M ${BAR_RADIUS} 0`,
    `H ${notchLeft}`,
    `C ${center - 39} 0, ${center - 38} ${NOTCH_DEPTH}, ${center} ${NOTCH_DEPTH}`,
    `C ${center + 38} ${NOTCH_DEPTH}, ${center + 39} 0, ${notchRight} 0`,
    `H ${width - BAR_RADIUS}`,
    `A ${BAR_RADIUS} ${BAR_RADIUS} 0 0 1 ${width} ${BAR_RADIUS}`,
    `V ${BAR_HEIGHT - BAR_RADIUS}`,
    `A ${BAR_RADIUS} ${BAR_RADIUS} 0 0 1 ${width - BAR_RADIUS} ${BAR_HEIGHT}`,
    `H ${BAR_RADIUS}`,
    `A ${BAR_RADIUS} ${BAR_RADIUS} 0 0 1 0 ${BAR_HEIGHT - BAR_RADIUS}`,
    `V ${BAR_RADIUS}`,
    `A ${BAR_RADIUS} ${BAR_RADIUS} 0 0 1 ${BAR_RADIUS} 0`,
    'Z',
  ].join(' ');
}

export default function NotchTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const colors = useThemeColors();
  const scheme = useColorScheme() === 'light' ? 'light' : 'dark';
  const insets = useSafeAreaInsets();
  const commonTranslation = useTranslation('common');
  const hasUnread = useUnreadBadge();
  // 'Offers' is a hidden route of the tabs (index 4): the centre button is the active one while it is focused.
  const offersFocused = state.routes[state.index]?.name === 'Offers';
  const [width, setWidth] = useState(0);
  const sideWidth = Math.max(0, (width - NOTCH_WIDTH) / 2);

  const onLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  const renderRoute = (routeIndex: number) => {
    const route = state.routes[routeIndex];
    if (!route) return null;
    const focused = state.index === routeIndex;
    const descriptor = descriptors[route.key];
    const label = commonTranslation.t(`tabs.${route.name.toLowerCase()}`);
    // brandText, not brand: the 11 px label needs the text-contrast variant of the primary colour.
    const color = focused ? colors.brandText : colors.textSecondary;
    const onPress = () => {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
    };

    let icon: React.ReactNode;
    if (route.name === 'Map') icon = <IconMap size={24} color={color} strokeWidth={2} />;
    else if (route.name === 'Nearby') icon = <IconRadar2 size={24} color={color} strokeWidth={2} />;
    else if (route.name === 'Messages') {
      icon = (
        <View>
          <IconMessageCircle size={24} color={color} strokeWidth={2} />
          {hasUnread ? (
            <View style={[styles.unreadDot, { backgroundColor: colors.danger, borderColor: colors.bgSurface }]} />
          ) : null}
        </View>
      );
    } else {
      icon = <ProfileTabAvatar active={focused} refreshKey={state.index} />;
    }

    return (
      <Pressable
        key={route.key}
        accessibilityLabel={label}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
        onPress={onPress}
        style={styles.tabItem}
        testID={descriptor.options.tabBarButtonTestID ?? `tab-${route.name.toLowerCase()}`}
      >
        <View style={[styles.pill, focused && { backgroundColor: colors.brandLight }]}>
          <View style={styles.iconSlot}>{icon}</View>
          <Text
            adjustsFontSizeToFit
            maxFontSizeMultiplier={1.2}
            minimumFontScale={0.85}
            numberOfLines={1}
            style={[styles.label, { color }]}
          >
            {label}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View
      testID="tab-bar"
      onLayout={onLayout}
      style={[
        styles.container,
        {
          bottom: 26 + insets.bottom,
          shadowColor: colors.textPrimary,
        },
        IS_IOS ? styles.iosShadow : null,
      ]}
    >
      {width > 0 && !IS_IOS ? (
        // Android: shadow drawn in SVG (elevation needs a background), under the bar.
        <Svg
          height={BAR_HEIGHT + SHADOW_PAD * 2}
          pointerEvents="none"
          style={[styles.androidShadow, { left: -SHADOW_PAD, top: -SHADOW_PAD }]}
          width={width + SHADOW_PAD * 2}
        >
          <Defs>
            <Filter height="200%" id="barShadowBlur" width="200%" x="-50%" y="-50%">
              <FeGaussianBlur stdDeviation={SHADOW_BLUR} />
            </Filter>
          </Defs>
          <Path
            d={notchPath(width)}
            fill={colors.textPrimary}
            filter="url(#barShadowBlur)"
            opacity={0.12}
            transform={`translate(${SHADOW_PAD} ${SHADOW_PAD + SHADOW_OFFSET_Y})`}
          />
        </Svg>
      ) : null}

      {IS_IOS && width > 0 ? (
        // iOS: the blur is masked with the exact bar shape, so the notch stays transparent.
        <MaskedView
          maskElement={
            <Svg height={BAR_HEIGHT} width={width}>
              <Path d={notchPath(width)} fill="black" />
            </Svg>
          }
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        >
          <BlurView intensity={60} style={StyleSheet.absoluteFill} tint={scheme} />
        </MaskedView>
      ) : null}

      {width > 0 ? (
        <Svg height={BAR_HEIGHT} pointerEvents="none" style={[StyleSheet.absoluteFill, styles.visible]} width={width}>
          <Path
            d={notchPath(width)}
            fill={IS_IOS ? colors.tabBarGlass : colors.tabBarGlassAndroid}
            stroke={colors.borderSubtle}
            strokeWidth={1}
          />
        </Svg>
      ) : null}

      <View style={[styles.side, styles.leftSide, { width: sideWidth }]}>
        {renderRoute(0)}
        {renderRoute(1)}
      </View>
      <View style={[styles.side, styles.rightSide, { width: sideWidth }]}>
        {renderRoute(2)}
        {renderRoute(3)}
      </View>

      <Pressable
        accessibilityLabel={commonTranslation.t('tabs.offers')}
        accessibilityRole="button"
        accessibilityState={{ selected: offersFocused }}
        onPress={() => navigation.navigate('Offers')}
        testID="tab-offers"
        style={[
          styles.offersButton,
          {
            backgroundColor: colors.brandFill,
            shadowColor: colors.brand,
          },
          offersFocused && { borderColor: colors.bgSurface, borderWidth: 3, transform: [{ scale: 1.08 }] },
        ]}
      >
        <IconSpeakerphone size={26} color={palette.bgSurfaceLight} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: BAR_HEIGHT,
    left: 16,
    position: 'absolute',
    right: 16,
  },
  iosShadow: {
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
  },
  androidShadow: { position: 'absolute' },
  visible: { overflow: 'visible' },
  side: {
    flexDirection: 'row',
    height: BAR_HEIGHT,
    position: 'absolute',
    top: 0,
  },
  leftSide: { left: 0 },
  rightSide: { right: 0 },
  tabItem: {
    alignItems: 'center',
    flex: 1,
    height: BAR_HEIGHT,
    justifyContent: 'center',
    minWidth: 48,
  },
  pill: {
    alignItems: 'center',
    borderRadius: 18,
    // Android drew the active tab's background as a square on the Profile tab (its icon is a clipped, bordered
    // avatar); clipping the pill to its own rounded shape makes both platforms identical.
    overflow: 'hidden',
    gap: 2,
    maxWidth: '100%',
    paddingHorizontal: 6,
    paddingVertical: 5,
  },
  // As tall as the profile avatar (30), so every pill and label lines up whatever the icon is.
  iconSlot: {
    alignItems: 'center',
    height: 30,
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
  },
  unreadDot: {
    borderRadius: 5,
    borderWidth: 2,
    height: 9,
    position: 'absolute',
    right: -4,
    top: -3,
    width: 9,
  },
  offersButton: {
    alignItems: 'center',
    borderRadius: 30,
    elevation: 12,
    height: 60,
    justifyContent: 'center',
    left: '50%',
    marginLeft: -30,
    position: 'absolute',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.38,
    shadowRadius: 11,
    top: -30,
    width: 60,
  },
});
