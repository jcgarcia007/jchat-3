/**
 * JChat 3.0 — Reset Password Screen
 * Runs only while a verified recovery session is isolated by RecoveryStack.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  BackHandler,
} from 'react-native';
import { Spinner } from '../../components/common/Spinner';
import AppText from '../../components/common/AppText';
import FormField from '../../components/common/FormField';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { IconEye, IconEyeOff, IconLock } from '@tabler/icons-react-native';

import { palette } from '../../theme/tokens';
import { useThemeColors } from '../../theme/colors';
import { controlMinHeight, fieldGap, sectionGap, space } from '../../theme/spacing';
import { supabase, isSupabaseConfigured } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import { showAlert } from '../../utils/dialog';

export default function ResetPasswordScreen() {
  const c = useThemeColors();
  const { t } = useTranslation('auth');
  const { clearRecovery } = useAuth();
  const fieldPalette = { background: c.bgSurface, border: c.borderSubtle };

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, []);

  const handleSave = useCallback(async () => {
    if (newPassword.length < 8) {
      showAlert(t('resetPassword.errorTitle'), t('resetPassword.errorTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      showAlert(t('resetPassword.errorTitle'), t('resetPassword.errorMismatch'));
      return;
    }

    setLoading(true);
    if (!isSupabaseConfigured) {
      await clearRecovery();
      setLoading(false);
      showAlert(t('resetPassword.successTitle'), t('resetPassword.successMessage'));
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setLoading(false);
      showAlert(t('resetPassword.errorTitle'), t('resetPassword.errorTryAgain'));
      return;
    }

    const { error: signOutOthersError } = await supabase.auth.signOut({ scope: 'others' });
    if (signOutOthersError) {
      console.warn('[ResetPassword] could not revoke other sessions:', signOutOthersError.message);
    }

    try {
      await clearRecovery();
      showAlert(t('resetPassword.successTitle'), t('resetPassword.successMessage'));
    } catch (error) {
      console.warn('[ResetPassword] could not clear recovery state:', error);
      showAlert(t('resetPassword.errorTitle'), t('resetPassword.errorTryAgain'));
    } finally {
      setLoading(false);
    }
  }, [clearRecovery, confirmPassword, newPassword, t]);

  const handleCancel = useCallback(async () => {
    if (loading) return;
    setLoading(true);

    if (isSupabaseConfigured) {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) {
        setLoading(false);
        showAlert(t('resetPassword.errorTitle'), t('resetPassword.cancelError'));
        return;
      }
    }

    try {
      await clearRecovery();
    } catch (error) {
      console.warn('[ResetPassword] could not clear recovery state after cancel:', error);
      showAlert(t('resetPassword.errorTitle'), t('resetPassword.cancelError'));
    } finally {
      setLoading(false);
    }
  }, [clearRecovery, loading, t]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bgBase }]}>
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
          <View style={[styles.iconWrap, { backgroundColor: palette.brandLight }]}>
            <IconLock size={32} color={palette.brand} strokeWidth={1.5} />
          </View>

          <AppText variant="title" style={styles.title}>
            {t('resetPassword.title')}
          </AppText>
          <AppText variant="body" color={c.textSecondary} style={styles.subtitle}>
            {t('resetPassword.subtitle')}
          </AppText>

          <FormField
            first
            label={t('resetPassword.newLabel')}
            palette={fieldPalette}
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder={t('resetPassword.newPlaceholder')}
            secureTextEntry={!showNew}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel={t('resetPassword.newA11y')}
            right={
              <TouchableOpacity
                onPress={() => setShowNew((value) => !value)}
                accessibilityLabel={showNew ? t('resetPassword.hidePassword') : t('resetPassword.showPassword')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {showNew
                  ? <IconEyeOff size={20} color={c.textSecondary} strokeWidth={1.8} />
                  : <IconEye size={20} color={c.textSecondary} strokeWidth={1.8} />}
              </TouchableOpacity>
            }
          />

          <FormField
            label={t('resetPassword.confirmLabel')}
            palette={fieldPalette}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder={t('resetPassword.confirmPlaceholder')}
            secureTextEntry={!showConfirm}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel={t('resetPassword.confirmA11y')}
            right={
              <TouchableOpacity
                onPress={() => setShowConfirm((value) => !value)}
                accessibilityLabel={showConfirm ? t('resetPassword.hidePassword') : t('resetPassword.showPassword')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {showConfirm
                  ? <IconEyeOff size={20} color={c.textSecondary} strokeWidth={1.8} />
                  : <IconEye size={20} color={c.textSecondary} strokeWidth={1.8} />}
              </TouchableOpacity>
            }
          />

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: palette.brandFill }, loading && styles.btnDisabled]}
            onPress={handleSave}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={t('resetPassword.saveA11y')}
          >
            {loading
              ? <Spinner color={palette.textPrimary} />
              : <AppText variant="button" color={palette.textPrimary} style={styles.saveBtnText}>{t('resetPassword.saveButton')}</AppText>}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={handleCancel}
            disabled={loading}
            accessibilityRole="button"
          >
            <AppText variant="button" color={c.textSecondary} style={styles.cancelBtnText}>
              {t('resetPassword.cancel')}
            </AppText>
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
  iconWrap: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: sectionGap },
  title: { fontWeight: '700', marginBottom: space.sm },
  subtitle: { marginBottom: sectionGap },
  saveBtn: {
    minHeight: controlMinHeight,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: sectionGap,
  },
  btnDisabled: { opacity: 0.6 },
  saveBtnText: { fontWeight: '700' },
  cancelBtn: { minHeight: controlMinHeight, alignItems: 'center', justifyContent: 'center', marginTop: fieldGap },
  cancelBtnText: { fontWeight: '600' },
});
