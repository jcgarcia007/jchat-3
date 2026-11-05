/**
 * JChat 3.0 — Change Password Screen
 * Authenticated users can change their password here.
 * Re-authenticates with the current password (signInWithPassword) before
 * calling supabase.auth.updateUser({ password }), so an open session alone
 * can't change the password.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Spinner } from '../../components/common/Spinner';
import AppText from '../../components/common/AppText';
import FormField from '../../components/common/FormField';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { IconEye, IconEyeOff, IconChevronLeft } from '@tabler/icons-react-native';

import { palette } from '../../theme/tokens';
import { useThemeColors } from '../../theme/colors';
import { controlMinHeight, sectionGap, space } from '../../theme/spacing';
import { supabase, isSupabaseConfigured } from '../../services/supabase';
import { toUserMessage } from '../../utils/errors';
import { useCaptcha, captchaErrorI18nKeys } from '../../services/captcha';
import { showAlert } from '../../utils/dialog';

export default function ChangePasswordScreen() {
  const c = useThemeColors();
  const navigation = useNavigation();
  const fieldPalette = { background: c.bgSurface, border: c.borderSubtle };
  const { t } = useTranslation('settings');
  // Captcha strings live in the `auth` namespace (shared with Login/Register).
  const { t: tAuth } = useTranslation('auth');
  // hCaptcha (D-38): the re-auth signInWithPassword needs a token too.
  const { captchaEnabled, getCaptchaToken, CaptchaGate } = useCaptcha();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSave = useCallback(async () => {
    if (!currentPassword) {
      showAlert(t('changePassword.errorTitle'), t('changePassword.errorCurrentRequired'));
      return;
    }
    if (newPassword.length < 8) {
      showAlert(t('changePassword.errorTitle'), t('changePassword.errorTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      showAlert(t('changePassword.errorTitle'), t('changePassword.errorMismatch'));
      return;
    }
    if (!isSupabaseConfigured) {
      showAlert(t('changePassword.successTitle'), t('changePassword.successMessage'));
      navigation.goBack();
      return;
    }
    setLoading(true);
    // Re-authenticate: verify the current password before allowing the change.
    const { data: { session } } = await supabase.auth.getSession();
    const email = session?.user?.email;
    if (!email) {
      setLoading(false);
      showAlert(t('changePassword.errorTitle'), t('changePassword.errorCurrentWrong'));
      return;
    }
    let captchaToken: string | null = null;
    if (captchaEnabled) {
      try {
        captchaToken = await getCaptchaToken();
      } catch (err) {
        setLoading(false);
        const { titleKey, messageKey } = captchaErrorI18nKeys(err);
        showAlert(tAuth(titleKey), tAuth(messageKey));
        return;
      }
      if (captchaToken === null) {
        // User cancelled: don't call Supabase without a token.
        setLoading(false);
        showAlert(tAuth('captcha.cancelledTitle'), tAuth('captcha.cancelledMessage'));
        return;
      }
    }
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
      options: { captchaToken: captchaToken ?? undefined },
    });
    if (reauthError) {
      setLoading(false);
      showAlert(t('changePassword.errorTitle'), t('changePassword.errorCurrentWrong'));
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);
    if (error) {
      showAlert(t('changePassword.errorTitle'), toUserMessage(error));
      return;
    }
    showAlert(t('changePassword.successTitle'), t('changePassword.successMessage'), [
      { text: t('actions.ok', { ns: 'common' }), onPress: () => navigation.goBack() },
    ]);
  }, [currentPassword, newPassword, confirmPassword, t, tAuth, navigation, captchaEnabled, getCaptchaToken]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bgBase }]}>
      {/* hCaptcha (D-38): invisible; renders null unless a challenge is active. */}
      {CaptchaGate}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.backBtn}
              accessibilityRole="button"
              accessibilityLabel={t('changePassword.backA11y')}
            >
              <IconChevronLeft size={24} color={c.textPrimary} strokeWidth={2} />
            </TouchableOpacity>
            <AppText variant="title" style={styles.title}>
              {t('changePassword.title')}
            </AppText>
          </View>

          <AppText variant="body" color={c.textSecondary} style={styles.subtitle}>
            {t('changePassword.subtitle')}
          </AppText>

          {/* Current password */}
          <FormField
            first
            label={t('changePassword.currentPassword')}
            palette={fieldPalette}
            value={currentPassword}
            onChangeText={setCurrentPassword}
            placeholder={t('changePassword.currentPasswordPlaceholder')}
            secureTextEntry={!showCurrent}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            autoComplete="current-password"
            right={
              <TouchableOpacity
                onPress={() => setShowCurrent((v) => !v)}
                accessibilityLabel={showCurrent ? t('changePassword.hidePassword') : t('changePassword.showPassword')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {showCurrent
                  ? <IconEyeOff size={20} color={c.textSecondary} strokeWidth={1.8} />
                  : <IconEye size={20} color={c.textSecondary} strokeWidth={1.8} />
                }
              </TouchableOpacity>
            }
          />

          {/* New password */}
          <FormField
            label={t('changePassword.newLabel')}
            palette={fieldPalette}
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder={t('changePassword.newPlaceholder')}
            secureTextEntry={!showNew}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel={t('changePassword.newA11y')}
            right={
              <TouchableOpacity
                onPress={() => setShowNew((v) => !v)}
                accessibilityLabel={showNew ? t('changePassword.hidePassword') : t('changePassword.showPassword')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {showNew
                  ? <IconEyeOff size={20} color={c.textSecondary} strokeWidth={1.8} />
                  : <IconEye size={20} color={c.textSecondary} strokeWidth={1.8} />
                }
              </TouchableOpacity>
            }
          />

          {/* Confirm password */}
          <FormField
            label={t('changePassword.confirmLabel')}
            palette={fieldPalette}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder={t('changePassword.confirmPlaceholder')}
            secureTextEntry={!showConfirm}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel={t('changePassword.confirmA11y')}
            right={
              <TouchableOpacity
                onPress={() => setShowConfirm((v) => !v)}
                accessibilityLabel={showConfirm ? t('changePassword.hidePassword') : t('changePassword.showPassword')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {showConfirm
                  ? <IconEyeOff size={20} color={c.textSecondary} strokeWidth={1.8} />
                  : <IconEye size={20} color={c.textSecondary} strokeWidth={1.8} />
                }
              </TouchableOpacity>
            }
          />

          {/* Save button */}
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: palette.brandFill }, loading && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={t('changePassword.saveA11y')}
          >
            {loading
              ? <Spinner color={palette.onBrand} />
              : <AppText variant="button" color={palette.onBrand} style={styles.saveBtnText}>{t('changePassword.saveButton')}</AppText>
            }
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: { padding: space.xl },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.lg },
  backBtn: { padding: space.xs },
  title: { fontWeight: '700' },
  subtitle: { marginBottom: sectionGap },
  saveBtn: {
    minHeight: controlMinHeight,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: sectionGap,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontWeight: '700' },
});
