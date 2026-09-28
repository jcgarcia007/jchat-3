/**
 * JChat 3.0 — Reset Password Screen
 * Runs only while a verified recovery session is isolated by RecoveryStack.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { IconEye, IconEyeOff, IconLock } from '@tabler/icons-react-native';

import { palette } from '../../theme/tokens';
import { useThemeColors } from '../../theme/colors';
import { supabase, isSupabaseConfigured } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';

const BTN_HEIGHT = 52;
const INPUT_HEIGHT = 52;

export default function ResetPasswordScreen() {
  const c = useThemeColors();
  const { t } = useTranslation('auth');
  const { clearRecovery } = useAuth();

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
      Alert.alert(t('resetPassword.errorTitle'), t('resetPassword.errorTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert(t('resetPassword.errorTitle'), t('resetPassword.errorMismatch'));
      return;
    }

    setLoading(true);
    if (!isSupabaseConfigured) {
      await clearRecovery();
      setLoading(false);
      Alert.alert(t('resetPassword.successTitle'), t('resetPassword.successMessage'));
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setLoading(false);
      Alert.alert(t('resetPassword.errorTitle'), t('resetPassword.errorTryAgain'));
      return;
    }

    const { error: signOutOthersError } = await supabase.auth.signOut({ scope: 'others' });
    if (signOutOthersError) {
      console.warn('[ResetPassword] could not revoke other sessions:', signOutOthersError.message);
    }

    try {
      await clearRecovery();
      Alert.alert(t('resetPassword.successTitle'), t('resetPassword.successMessage'));
    } catch (error) {
      console.warn('[ResetPassword] could not clear recovery state:', error);
      Alert.alert(t('resetPassword.errorTitle'), t('resetPassword.errorTryAgain'));
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
        Alert.alert(t('resetPassword.errorTitle'), t('resetPassword.cancelError'));
        return;
      }
    }

    try {
      await clearRecovery();
    } catch (error) {
      console.warn('[ResetPassword] could not clear recovery state after cancel:', error);
      Alert.alert(t('resetPassword.errorTitle'), t('resetPassword.cancelError'));
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

          <Text style={[styles.title, { color: c.textPrimary }]}>
            {t('resetPassword.title')}
          </Text>
          <Text style={[styles.subtitle, { color: c.textSecondary }]}>
            {t('resetPassword.subtitle')}
          </Text>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: c.textSecondary }]}>
              {t('resetPassword.newLabel')}
            </Text>
            <View style={[styles.inputRow, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
              <TextInput
                style={[styles.input, { color: c.textPrimary }]}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder={t('resetPassword.newPlaceholder')}
                placeholderTextColor={c.textTertiary}
                secureTextEntry={!showNew}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel={t('resetPassword.newA11y')}
              />
              <TouchableOpacity
                onPress={() => setShowNew((value) => !value)}
                accessibilityLabel={showNew ? t('resetPassword.hidePassword') : t('resetPassword.showPassword')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {showNew
                  ? <IconEyeOff size={20} color={c.textSecondary} strokeWidth={1.8} />
                  : <IconEye size={20} color={c.textSecondary} strokeWidth={1.8} />}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: c.textSecondary }]}>
              {t('resetPassword.confirmLabel')}
            </Text>
            <View style={[styles.inputRow, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
              <TextInput
                style={[styles.input, { color: c.textPrimary }]}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder={t('resetPassword.confirmPlaceholder')}
                placeholderTextColor={c.textTertiary}
                secureTextEntry={!showConfirm}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel={t('resetPassword.confirmA11y')}
              />
              <TouchableOpacity
                onPress={() => setShowConfirm((value) => !value)}
                accessibilityLabel={showConfirm ? t('resetPassword.hidePassword') : t('resetPassword.showPassword')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {showConfirm
                  ? <IconEyeOff size={20} color={c.textSecondary} strokeWidth={1.8} />
                  : <IconEye size={20} color={c.textSecondary} strokeWidth={1.8} />}
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: palette.brand }, loading && styles.btnDisabled]}
            onPress={handleSave}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={t('resetPassword.saveA11y')}
          >
            {loading
              ? <ActivityIndicator color={palette.textPrimary} />
              : <Text style={styles.saveBtnText}>{t('resetPassword.saveButton')}</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={handleCancel}
            disabled={loading}
            accessibilityRole="button"
          >
            <Text style={[styles.cancelBtnText, { color: c.textSecondary }]}>
              {t('resetPassword.cancel')}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: { padding: 24, gap: 20 },
  iconWrap: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { fontSize: 14, lineHeight: 22 },
  fieldGroup: { gap: 6 },
  label: { fontSize: 13, fontWeight: '500' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: INPUT_HEIGHT,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    gap: 8,
  },
  input: { flex: 1, fontSize: 15 },
  saveBtn: {
    height: BTN_HEIGHT,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  btnDisabled: { opacity: 0.6 },
  saveBtnText: { color: palette.textPrimary, fontSize: 16, fontWeight: '700' },
  cancelBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { fontSize: 15, fontWeight: '600' },
});
