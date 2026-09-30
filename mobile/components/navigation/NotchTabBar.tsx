import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
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

const BAR_HEIGHT = 68;
const BAR_RADIUS = 34;
const NOTCH_WIDTH = 104;
const NOTCH_DEPTH = 34;

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
  const insets = useSafeAreaInsets();
  const commonTranslation = useTranslation('common');
  const hasUnread = useUnreadBadge();
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
    const labelKey = `tabs.${route.name.toLowerCase()}`;
    const color = focused ? colors.brand : colors.textSecondary;
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
        accessibilityLabel={commonTranslation.t(labelKey)}
        accessibilityRole="button"
        accessibilityState={{ selected: focused }}
        onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
        onPress={onPress}
        style={styles.tabItem}
        testID={descriptor.options.tabBarButtonTestID}
      >
        {focused ? <View style={[styles.activeDot, { backgroundColor: colors.brand }]} /> : null}
        {icon}
      </Pressable>
    );
  };

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.container,
        {
          bottom: 26 + insets.bottom,
          shadowColor: colors.textPrimary,
        },
      ]}
    >
      {width > 0 ? (
        <Svg height={BAR_HEIGHT} pointerEvents="none" style={StyleSheet.absoluteFill} width={width}>
          <Path d={notchPath(width)} fill={colors.bgSurface} />
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
        onPress={() => navigation.navigate('Offers')}
        style={[
          styles.offersButton,
          {
            backgroundColor: colors.brand,
            shadowColor: colors.brand,
          },
        ]}
      >
        <IconSpeakerphone size={26} color={palette.bgSurfaceLight} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    elevation: 10,
    height: BAR_HEIGHT,
    left: 16,
    position: 'absolute',
    right: 16,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
  },
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
  activeDot: {
    borderRadius: 3,
    height: 6,
    position: 'absolute',
    top: 8,
    width: 6,
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
