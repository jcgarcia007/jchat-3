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
import Svg, { Circle, ClipPath, Defs, FeGaussianBlur, Filter, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import {
  IconMap,
  IconMessageCircle,
  IconRadar2,
  IconSpeakerphone,
} from '@tabler/icons-react-native';
import { useTranslation } from 'react-i18next';

import { useReduceTransparency } from '../../hooks/useReduceTransparency';
import { useUnreadBadge } from '../../hooks/useUnreadBadge';
import { glassMetrics, useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import ProfileTabAvatar from './ProfileTabAvatar';
import { BAR_HEIGHT, BUTTON_SIZE, CENTER_Y, NOTCH_ROOM, barPath } from './notchGeometry';

/** Screens read the bar's height to leave room for it. */
export { BAR_HEIGHT };

/** Side margin of the bar (the canvas: 14 pt; a 390 pt phone gets a 362 pt bar). */
const BAR_MARGIN = 14;
/** The shadow of the bar is a blurred copy of its outline, drawn the same way on iOS and Android (a translucent view casts a weak native shadow). */
const SHADOW_BLUR = 8;
const SHADOW_PAD = 36;
const IS_IOS = Platform.OS === 'ios';

export default function NotchTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const colors = useThemeColors();
  const scheme = useColorScheme() === 'light' ? 'light' : 'dark';
  const metrics = glassMetrics(scheme);
  const insets = useSafeAreaInsets();
  const commonTranslation = useTranslation('common');
  const hasUnread = useUnreadBadge();
  // Reduce transparency (iOS): the blur and the translucent fill become a SOLID surface with the same shape.
  const reduceTransparency = useReduceTransparency();
  // 'Offers' is a hidden route of the tabs (index 4): the centre button is the active one while it is focused.
  const offersFocused = state.routes[state.index]?.name === 'Offers';
  const [width, setWidth] = useState(0);
  const sideWidth = Math.max(0, (width - NOTCH_ROOM) / 2);
  const outline = width > 0 ? barPath(width) : '';

  const onLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  const renderRoute = (routeIndex: number) => {
    const route = state.routes[routeIndex];
    if (!route) return null;
    const focused = state.index === routeIndex;
    const descriptor = descriptors[route.key];
    const label = commonTranslation.t(`tabs.${route.name.toLowerCase()}`);
    // Icons: brandText when active, textSecondary otherwise (3:1 or more over the glass on the worst background). Labels: textPrimary
    // (4.5:1 or more there), bold when active; the active tab is also marked by its bubble.
    const iconColor = focused ? colors.brandText : colors.textSecondary;
    const onPress = () => {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
    };

    let icon: React.ReactNode;
    if (route.name === 'Map') icon = <IconMap size={24} color={iconColor} strokeWidth={2} />;
    else if (route.name === 'Nearby') icon = <IconRadar2 size={24} color={iconColor} strokeWidth={2} />;
    else if (route.name === 'Messages') {
      icon = (
        <View>
          <IconMessageCircle size={24} color={iconColor} strokeWidth={2} />
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
        <View style={[styles.pill, focused && { backgroundColor: colors.tabPillActive }]}>
          <View style={styles.iconSlot}>{icon}</View>
          <Text
            adjustsFontSizeToFit
            maxFontSizeMultiplier={1.2}
            minimumFontScale={0.85}
            numberOfLines={1}
            style={[styles.label, { color: colors.textPrimary, fontWeight: focused ? '800' : '600' }]}
          >
            {label}
          </Text>
        </View>
      </Pressable>
    );
  };

  const fill = reduceTransparency ? colors.bgSurface : IS_IOS ? colors.tabBarGlass : colors.tabBarGlassAndroid;

  return (
    <View
      testID="tab-bar"
      onLayout={onLayout}
      style={[styles.container, { bottom: 26 + insets.bottom }]}
    >
      {width > 0 ? (
        // The bar's own shadow: wide and neutral, apart from the button's (which is brand-coloured and only downwards).
        <Svg
          height={BAR_HEIGHT + SHADOW_PAD * 2}
          pointerEvents="none"
          style={[styles.shadow, { left: -SHADOW_PAD, top: -SHADOW_PAD }]}
          width={width + SHADOW_PAD * 2}
        >
          <Defs>
            <Filter height="260%" id="barShadowBlur" width="140%" x="-20%" y="-80%">
              <FeGaussianBlur stdDeviation={SHADOW_BLUR} />
            </Filter>
          </Defs>
          <Path
            d={outline}
            fill={palette.shadow}
            filter="url(#barShadowBlur)"
            opacity={metrics.barShadowOpacity}
            transform={`translate(${SHADOW_PAD} ${SHADOW_PAD + metrics.barShadowOffsetY})`}
          />
        </Svg>
      ) : null}

      {IS_IOS && width > 0 && !reduceTransparency ? (
        // iOS: the blur is masked with the exact bar shape, so the notch stays transparent.
        <MaskedView
          maskElement={
            <Svg height={BAR_HEIGHT} width={width}>
              <Path d={outline} fill="black" />
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
          <Defs>
            <ClipPath id="barTopHalf">
              <Rect x={-2} y={-2} width={width + 4} height={BAR_HEIGHT / 2 + 2} />
            </ClipPath>
          </Defs>
          <Path d={outline} fill={fill} stroke={colors.glassEdgeLine} strokeWidth={1} />
          {/* The bright line on the top half of the outline (the bar's specular edge). */}
          <Path clipPath="url(#barTopHalf)" d={outline} fill="none" stroke={colors.glassEdgeHighlight} strokeWidth={1.2} />
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

      <Text
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        numberOfLines={1}
        style={[styles.offersLabel, { color: colors.textPrimary, fontWeight: offersFocused ? '800' : '700' }]}
      >
        {commonTranslation.t('tabs.offers')}
      </Text>

      <Pressable
        accessibilityLabel={commonTranslation.t('tabs.offers')}
        accessibilityRole="button"
        accessibilityState={{ selected: offersFocused }}
        onPress={() => navigation.navigate('Offers')}
        testID="tab-offers"
        style={[
          styles.offersButton,
          {
            backgroundColor: colors.brandFillGlass,
            borderColor: colors.offersBorder,
            shadowColor: metrics.offersShadowColor,
            shadowOpacity: metrics.offersShadowOpacity,
            shadowRadius: metrics.offersShadowRadius,
            shadowOffset: { width: 0, height: metrics.offersShadowOffsetY },
          },
          offersFocused && { transform: [{ scale: 1.06 }] },
        ]}
      >
        {/* Soft highlight up-left (a radial gradient, as in the canvas). */}
        <Svg height={BUTTON_SIZE} pointerEvents="none" style={StyleSheet.absoluteFill} width={BUTTON_SIZE}>
          <Defs>
            <RadialGradient cx="35%" cy="25%" id="offersReflect" r="45%">
              <Stop offset="0" stopColor={colors.glassReflect} />
              <Stop offset="1" stopColor={colors.glassReflect} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={BUTTON_SIZE / 2} cy={BUTTON_SIZE / 2} fill="url(#offersReflect)" r={BUTTON_SIZE / 2} />
        </Svg>
        <IconSpeakerphone size={28} color={palette.onBrand} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: BAR_HEIGHT,
    left: BAR_MARGIN,
    position: 'absolute',
    right: BAR_MARGIN,
  },
  shadow: { position: 'absolute' },
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
    minWidth: 44,
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
  // Under the notch, inside the bar (the notch is 41 pt deep, the bar 64: the label sits in the 23 pt below it).
  offersLabel: {
    bottom: 5,
    fontSize: 10,
    left: '50%',
    marginLeft: -NOTCH_ROOM / 2,
    position: 'absolute',
    textAlign: 'center',
    width: NOTCH_ROOM,
  },
  // Its centre is CENTER_Y below the bar's top edge, concentric with the notch's bowl.
  offersButton: {
    alignItems: 'center',
    borderRadius: BUTTON_SIZE / 2,
    borderWidth: 1,
    elevation: 8,
    height: BUTTON_SIZE,
    justifyContent: 'center',
    left: '50%',
    marginLeft: -BUTTON_SIZE / 2,
    position: 'absolute',
    top: CENTER_Y - BUTTON_SIZE / 2,
    width: BUTTON_SIZE,
  },
});
