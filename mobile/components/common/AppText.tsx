/**
 * AppText — the text of the type standard (B7). `variant` picks the role of theme/typography.ts: size, proportional
 * line height and the font-scale cap come with it; the default colour is the theme's primary text. Pass `family` to
 * keep a brand face (the login serif / mono) and `color` or `style` to override the colour. Never write a numeric
 * fontSize / lineHeight in `style`: that is what the roles are for.
 */

import React from 'react';
import { Text, type TextProps } from 'react-native';

import { useThemeColors } from '../../theme/colors';
import { loginFont } from '../../theme/loginFonts';
import { typeCap, typeStyle, type TypeRole } from '../../theme/typography';

export type AppTextFamily = keyof typeof loginFont;

export interface AppTextProps extends TextProps {
  variant: TypeRole;
  /** A brand face from theme/loginFonts.ts; omitted = the system font. */
  family?: AppTextFamily;
  /** Overrides the default colour (the theme's primary text). */
  color?: string;
}

export default function AppText({ variant, family, color, style, maxFontSizeMultiplier, ...rest }: AppTextProps) {
  const colors = useThemeColors();
  return (
    <Text
      {...rest}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? typeCap(variant)}
      style={[typeStyle(variant), { color: color ?? colors.textPrimary }, family ? { fontFamily: loginFont[family] } : null, style]}
    />
  );
}
