/**
 * JChat 3.0 — Reset Password Screen
 *
 * Shown when the app opens via the jchat://reset deep link from a password-reset
 * email. By the time this screen renders, AuthContext has already exchanged the
 * link's code/tokens with Supabase (PASSWORD_RECOVERY event) so a valid recovery
 * session is active. The user simply enters and confirms their new password.
 *
 * On success → clearRecovery() → AuthContext transitions to the normal MainStack.
 */

import React, { useState, useCallback } from 'react';
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

  const handleSave = useCallback(async () => {
    if (newPassword.length < 8) {
      Alert.alert(t('resetPassword.errorTitle'), t('resetPassword.errorTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert(t('resetPassword.errorTitle'), t('resetPassword.errorMismatch'));
      return;
    }
    if (!isSupabaseConfigured) {
      Alert.alert(t('resetPassword.successTitle'), t('resetPassword.successMessage'), [
        { text: 'OK', onPress: clearRecovery },
      ]);
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);
    if (error) {
      Alert.alert(t('resetPassword.errorTitle'), error.message);
      return;
    }
    Alert.alert(t('resetPassword.successTitle'), t('resetPassword.successMessage'), [
      // clearRecovery clears isRecovering → AppNavigator transitions to MainStack
      { text: 'OK', onPress: clearRecovery },
    ]);
  }, [newPassword, confirmPassword, t, clearRecovery]);

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
          {/* Icon */}
          <View style={[styles.iconWrap, { backgroundColor: `${palette.brand}20` }]}>
            <IconLock size={32} color={palette.brand} strokeWidth={1.5} />
          </View>

          <Text style={[styles.title, { color: c.textPrimary }]}>
            {t('resetPassword.title')}
          </Text>
          <Text style={[styles.subtitle, { color: c.textSecondary }]}>
            {t('resetPassword.subtitle')}
          </Text>

          {/* New password */}
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
                onPress={() => setShowNew((v) => !v)}
                accessibilityLabel={showNew ? t('resetPassword.hidePassword') : t('resetPassword.showPassword')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {showNew
                  ? <IconEyeOff size={20} color={c.textSecondary} strokeWidth={1.8} />
                  : <IconEye size={20} color={c.textSecondary} strokeWidth={1.8} />
                }
              </TouchableOpacity>
            </View>
          </View>

          {/* Confirm password */}
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
                onPress={() => setShowConfirm((v) => !v)}
                accessibilityLabel={showConfirm ? t('resetPassword.hidePassword') : t('resetPassword.showPassword')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {showConfirm
                  ? <IconEyeOff size={20} color={c.textSecondary} strokeWidth={1.8} />
                  : <IconEye size={20} color={c.textSecondary} strokeWidth={1.8} />
                }
              </TouchableOpacity>
            </View>
          </View>

          {/* Save button */}
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: palette.brand }, loading && styles.btnDisabled]}
            onPress={handleSave}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={t('resetPassword.saveA11y')}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveBtnText}>{t('resetPassword.saveButton')}</Text>
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
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
