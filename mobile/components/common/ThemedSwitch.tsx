/**
 * JChat 3.0 — ThemedSwitch: the app's Switch, looking the same on iOS, Android and web.
 * react-native-web paints the "on" thumb with its own teal unless `activeThumbColor` is set (RN's `thumbColor` is only
 * the "off" thumb there), so the white thumb is given for both states. Track colors come from the theme:
 * off = borderSubtle, on = brand (a screen may pass its own `trackColor`, e.g. a darker "off" for a dark card).
 * iOS keeps its native white thumb (no thumbColor) and iOS's background for the "off" track follows the "off" color.
 */

import React from 'react';
import { Platform, Switch, type SwitchProps } from 'react-native';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';

export function ThemedSwitch({ trackColor, thumbColor, ios_backgroundColor, ...rest }: SwitchProps): React.ReactElement {
  const c = useThemeColors();
  const off = trackColor?.false ?? c.borderSubtle;
  const on = trackColor?.true ?? c.brand;
  const thumb = thumbColor ?? (Platform.OS === 'ios' ? undefined : palette.onBrand);
  // react-native-web only: the thumb of the "on" state (not part of RN's SwitchProps typing).
  const webOn = Platform.OS === 'web' ? ({ activeThumbColor: thumb ?? palette.onBrand } as Record<string, unknown>) : null;
  return (
    <Switch
      {...rest}
      {...webOn}
      trackColor={{ false: off, true: on }}
      thumbColor={thumb}
      ios_backgroundColor={ios_backgroundColor ?? off}
    />
  );
}
