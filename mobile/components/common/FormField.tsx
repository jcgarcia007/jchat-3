/**
 * FormField — label + input + error of the type standard (B7). The label uses the `label` role and the input the
 * `field` role: both share the same font-scale cap (typography.ts), so the label never looks tiny next to the
 * value. Gaps come from theme/spacing.ts (label→input 6, field→field 16) and the input is at least 48 high.
 * Colours default to the theme; the login "ticket" passes its own palette. `right` is an absolutely placed slot
 * (the password eye); the input leaves room for it.
 */

import React from 'react';
import { StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import AppText, { type AppTextFamily } from './AppText';
import { useThemeColors } from '../../theme/colors';
import { loginFont } from '../../theme/loginFonts';
import { fieldGap, fieldLabelGap, controlMinHeight, space } from '../../theme/spacing';
import { typeCap, typeStyle } from '../../theme/typography';

export interface FormFieldPalette {
  label: string;
  text: string;
  placeholder: string;
  background: string;
  border: string;
  error: string;
}

export interface FormFieldProps extends Omit<TextInputProps, 'style'> {
  /** React 19: `ref` is a prop; it reaches the TextInput (programmatic focus). */
  ref?: React.Ref<TextInput>;
  label: string;
  error?: string | null;
  hint?: string | null;
  /** Content over the right edge of the input (e.g. the show-password button). */
  right?: React.ReactNode;
  palette?: Partial<FormFieldPalette>;
  /** Brand face for the label and the text (default: the system font). */
  labelFamily?: AppTextFamily;
  textFamily?: AppTextFamily;
  /** True for the first field of a group: no top gap. */
  first?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  /** Extra width reserved on the right for `right` (default 48). */
  rightWidth?: number;
}

export default function FormField({
  ref,
  label,
  error,
  hint,
  right,
  palette,
  labelFamily,
  textFamily,
  first,
  containerStyle,
  rightWidth = controlMinHeight,
  ...inputProps
}: FormFieldProps) {
  const c = useThemeColors();
  const p: FormFieldPalette = {
    label: palette?.label ?? c.textSecondary,
    text: palette?.text ?? c.textPrimary,
    placeholder: palette?.placeholder ?? c.textTertiary,
    background: palette?.background ?? c.bgElevated,
    border: palette?.border ?? c.borderSubtle,
    error: palette?.error ?? c.danger,
  };
  return (
    <View style={[first ? null : styles.gap, containerStyle]}>
      <AppText variant="label" family={labelFamily} color={p.label} style={styles.label}>
        {label}
      </AppText>
      <View style={styles.inputWrap}>
        <TextInput
          placeholderTextColor={p.placeholder}
          maxFontSizeMultiplier={typeCap('field')}
          accessibilityLabel={label}
          {...inputProps}
          ref={ref}
          style={[
            styles.input,
            typeStyle('field'),
            {
              color: p.text,
              backgroundColor: p.background,
              borderColor: error ? p.error : p.border,
            },
            textFamily ? { fontFamily: loginFont[textFamily] } : null,
            right ? { paddingRight: rightWidth } : null,
          ]}
        />
        {right ? <View style={[styles.right, { width: rightWidth }]}>{right}</View> : null}
      </View>
      {error ? (
        <AppText variant="caption" color={p.error} style={styles.below} accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" color={p.label} style={styles.below}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { marginTop: fieldGap },
  label: { marginBottom: fieldLabelGap },
  inputWrap: { justifyContent: 'center' },
  input: {
    minHeight: controlMinHeight,
    borderRadius: space.md,
    borderWidth: 1,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  right: { position: 'absolute', right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  below: { marginTop: fieldLabelGap },
});
