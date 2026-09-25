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
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { IconEye, IconEyeOff, IconChevronLeft } from '@tabler/icons-react-native';

import { palette } from '../../theme/tokens';
import { useThemeColors } from '../../theme/colors';
import { supabase, isSupabaseConfigured } from '../../services/supabase';

const BTN_HEIGHT = 52;
const INPUT_HEIGHT = 52;

export default function ChangePasswordScreen() {
  const c = useThemeColors();
  const navigation = useNavigation();
  const { t } = useTranslation('settings');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSave = useCallback(async () => {
    if (!currentPassword) {
      Alert.alert(t('changePassword.errorTitle'), t('changePassword.errorCurrentRequired'));
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert(t('changePassword.errorTitle'), t('changePassword.errorTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert(t('changePassword.errorTitle'), t('changePassword.errorMismatch'));
      return;
    }
    if (!isSupabaseConfigured) {
      Alert.alert(t('changePassword.successTitle'), t('changePassword.successMessage'));
      navigation.goBack();
      return;
    }
    setLoading(true);
    // Re-authenticate: verify the current password before allowing the change.
    const { data: { session } } = await supabase.auth.getSession();
    const email = session?.user?.email;
    if (!email) {
      setLoading(false);
      Alert.alert(t('changePassword.errorTitle'), t('changePassword.errorCurrentWrong'));
      return;
    }
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (reauthError) {
      setLoading(false);
      Alert.alert(t('changePassword.errorTitle'), t('changePassword.errorCurrentWrong'));
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);
    if (error) {
      Alert.alert(t('changePassword.errorTitle'), error.message);
      return;
    }
    Alert.alert(t('changePassword.successTitle'), t('changePassword.successMessage'), [
      { text: 'OK', onPress: () => navigation.goBack() },
    ]);
  }, [currentPassword, newPassword, confirmPassword, t, navigation]);

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
            <Text style={[styles.title, { color: c.textPrimary }]}>
              {t('changePassword.title')}
            </Text>
          </View>

          <Text style={[styles.subtitle, { color: c.textSecondary }]}>
            {t('changePassword.subtitle')}
          </Text>

          {/* Current password */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: c.textSecondary }]}>
              {t('changePassword.currentPassword')}
            </Text>
            <View style={[styles.inputRow, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
              <TextInput
                style={[styles.input, { color: c.textPrimary }]}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                placeholder={t('changePassword.currentPasswordPlaceholder')}
                placeholderTextColor={c.textTertiary}
                secureTextEntry={!showCurrent}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
                autoComplete="current-password"
                accessibilityLabel={t('changePassword.currentPassword')}
              />
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
            </View>
          </View>

          {/* New password */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: c.textSecondary }]}>
              {t('changePassword.newLabel')}
            </Text>
            <View style={[styles.inputRow, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
              <TextInput
                style={[styles.input, { color: c.textPrimary }]}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder={t('changePassword.newPlaceholder')}
                placeholderTextColor={c.textTertiary}
                secureTextEntry={!showNew}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel={t('changePassword.newA11y')}
              />
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
            </View>
          </View>

          {/* Confirm password */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: c.textSecondary }]}>
              {t('changePassword.confirmLabel')}
            </Text>
            <View style={[styles.inputRow, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
              <TextInput
                style={[styles.input, { color: c.textPrimary }]}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder={t('changePassword.confirmPlaceholder')}
                placeholderTextColor={c.textTertiary}
                secureTextEntry={!showConfirm}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel={t('changePassword.confirmA11y')}
              />
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
            </View>
          </View>

          {/* Save button */}
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: palette.brand }, loading && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={t('changePassword.saveA11y')}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveBtnText}>{t('changePassword.saveButton')}</Text>
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  backBtn: { padding: 4 },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: -8 },
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
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
