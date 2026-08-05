/**
 * JChat 3.0 — Work Mode Screen (POS employee access)
 *
 * Flow
 * ────
 * 1. Load businesses where the current user has pos_access via posMyBusinesses().
 * 2. Show list. Each card has:
 *    - Business name + employee role
 *    - "Set PIN" (has_pin === false) or "Enter POS" (has_pin === true)
 * 3. Tapping "Set PIN" → shows inline 4-6 digit PIN form → posSetPin() → navigate PosHome
 * 4. Tapping "Enter POS" → shows inline PIN-verify form → posVerifyPin() → navigate PosHome
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  IconBriefcase,
  IconChevronLeft,
  IconKeyboard,
  IconLock,
} from '@tabler/icons-react-native';

import { palette } from '../../theme/tokens';
import { useThemeColors } from '../../theme/colors';
import {
  posMyBusinesses,
  posSetPin,
  posVerifyPin,
  type PosMyBusinessesRow,
} from '../../services/pos';
import type { SettingsStackParamList } from '../../navigation/SettingsStack';

// ─── Flow state type ──────────────────────────────────────────────────────────

type FlowMode = 'list' | 'setPin' | 'verifyPin';

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function WorkModeScreen() {
  const c = useThemeColors();
  const { t } = useTranslation('settings');
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<SettingsStackParamList, 'WorkMode'>>();

  // ── Data state ─────────────────────────────────────────────────────────────
  const [businesses, setBusinesses] = useState<PosMyBusinessesRow[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Flow state ─────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<FlowMode>('list');
  const [selected, setSelected] = useState<PosMyBusinessesRow | null>(null);
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  const pinRef = useRef<TextInput>(null);

  // ── Load businesses on mount ───────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    posMyBusinesses()
      .then((rows) => {
        if (mounted) setBusinesses(rows);
      })
      .catch(() => {
        // Stay empty on error; user can retry by navigating away and back.
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // ── Focus PIN input when entering PIN mode ────────────────────────────────
  useEffect(() => {
    if (mode !== 'list') {
      const timer = setTimeout(() => pinRef.current?.focus(), 150);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [mode]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const openSetPin = useCallback((b: PosMyBusinessesRow) => {
    setSelected(b);
    setPin('');
    setPinConfirm('');
    setPinError(null);
    setMode('setPin');
  }, []);

  const openVerifyPin = useCallback((b: PosMyBusinessesRow) => {
    setSelected(b);
    setPin('');
    setPinConfirm('');
    setPinError(null);
    setMode('verifyPin');
  }, []);

  const cancelPin = useCallback(() => {
    setMode('list');
    setPin('');
    setPinConfirm('');
    setPinError(null);
    setSelected(null);
  }, []);

  const navigateToPosHome = useCallback(
    (b: PosMyBusinessesRow) => {
      setMode('list');
      navigation.navigate('PosHome', {
        businessId: b.business_id,
        businessName: b.business_name,
        employeeId: b.employee_id,
      });
    },
    [navigation],
  );

  const handleSetPin = useCallback(async () => {
    if (!selected) return;
    if (pin !== pinConfirm) {
      setPinError(t('workMode.errorPinMismatch'));
      return;
    }
    setSubmitting(true);
    setPinError(null);

    const result = await posSetPin(selected.business_id, pin);

    setSubmitting(false);

    if (result.ok) {
      // Mark has_pin locally so the row reflects the new state on back-navigation.
      setBusinesses((prev) =>
        prev.map((b) =>
          b.business_id === selected.business_id ? { ...b, has_pin: true } : b,
        ),
      );
      navigateToPosHome(selected);
    } else {
      switch (result.reason) {
        case 'pin_digits':
          setPinError(t('workMode.errorPinDigits'));
          break;
        case 'no_access':
          setPinError(t('workMode.errorNoAccess'));
          break;
        case 'not_configured':
          setPinError(t('workMode.errorNotConfigured'));
          break;
        default:
          setPinError(t('workMode.errorDb'));
      }
    }
  }, [selected, pin, pinConfirm, navigateToPosHome, t]);

  const handleVerifyPin = useCallback(async () => {
    if (!selected) return;
    setSubmitting(true);
    setPinError(null);

    const result = await posVerifyPin(selected.business_id, pin);

    setSubmitting(false);

    if (result.ok) {
      if (result.verified) {
        navigateToPosHome(selected);
      } else {
        Alert.alert(t('workMode.pinWrongTitle'), t('workMode.pinWrongMessage'));
        setPin('');
      }
    } else {
      switch (result.reason) {
        case 'no_pin':
          setPinError(t('workMode.errorNoPin'));
          break;
        case 'locked':
          setPinError(t('workMode.errorLocked'));
          break;
        case 'no_access':
          setPinError(t('workMode.errorNoAccess'));
          break;
        case 'not_configured':
          setPinError(t('workMode.errorNotConfigured'));
          break;
        default:
          setPinError(t('workMode.errorDb'));
      }
    }
  }, [selected, pin, navigateToPosHome, t]);

  // ── Sub-renders ────────────────────────────────────────────────────────────

  const renderHeader = () => (
    <View
      style={[
        styles.header,
        {
          paddingTop: insets.top + 12,
          backgroundColor: c.bgBase,
          borderBottomColor: c.borderSubtle,
        },
      ]}
    >
      <Pressable
        onPress={() => {
          if (mode !== 'list') {
            cancelPin();
          } else {
            navigation.goBack();
          }
        }}
        style={styles.backButton}
        accessibilityRole="button"
        accessibilityLabel={t('workMode.pinCancel')}
      >
        <IconChevronLeft size={24} color={c.brand} strokeWidth={2} />
      </Pressable>
      <Text style={[styles.headerTitle, { color: c.textPrimary }]}>
        {mode === 'setPin'
          ? t('workMode.pinTitle')
          : mode === 'verifyPin'
          ? t('workMode.pinTitleVerify')
          : t('workMode.title')}
      </Text>
    </View>
  );

  const renderPinForm = () => {
    // Disabled logic differs by mode:
    //   setPin    — both fields must be ≥4 digits and match
    //   verifyPin — only the first field needs ≥4 digits (no confirmation)
    const isReady =
      mode === 'setPin'
        ? pin.length >= 4 && pin === pinConfirm && pinConfirm.length >= 4
        : pin.length >= 4;
    const confirmDisabled = submitting || !isReady;

    return (
      <View style={styles.pinContainer}>
        {selected ? (
          <Text style={[styles.pinBusiness, { color: c.textSecondary }]}>
            {selected.business_name}
          </Text>
        ) : null}
        <Text style={[styles.pinSubtitle, { color: c.textTertiary }]}>
          {t('workMode.pinSubtitle')}
        </Text>

        {/* Primary PIN field */}
        <TextInput
          ref={pinRef}
          value={pin}
          onChangeText={(v) => {
            setPinError(null);
            setPin(v.replace(/[^0-9]/g, '').slice(0, 6));
          }}
          keyboardType="number-pad"
          maxLength={6}
          secureTextEntry
          placeholder={t('workMode.pinPlaceholder')}
          placeholderTextColor={c.textTertiary}
          style={[
            styles.pinInput,
            {
              color: c.textPrimary,
              backgroundColor: c.bgSurface,
              borderColor: pinError ? c.danger : c.borderSubtle,
            },
          ]}
          returnKeyType="done"
          onSubmitEditing={mode === 'setPin' ? handleSetPin : handleVerifyPin}
        />

        {/* Confirmation field — setPin only */}
        {mode === 'setPin' && (
          <TextInput
            value={pinConfirm}
            onChangeText={(v) => {
              setPinError(null);
              setPinConfirm(v.replace(/[^0-9]/g, '').slice(0, 6));
            }}
            keyboardType="number-pad"
            maxLength={6}
            secureTextEntry
            placeholder={t('workMode.pinConfirmPlaceholder')}
            placeholderTextColor={c.textTertiary}
            style={[
              styles.pinInput,
              {
                color: c.textPrimary,
                backgroundColor: c.bgSurface,
                borderColor: pinError ? c.danger : c.borderSubtle,
              },
            ]}
            returnKeyType="done"
            onSubmitEditing={handleSetPin}
          />
        )}

        {pinError ? (
          <Text style={[styles.pinError, { color: c.danger }]}>{pinError}</Text>
        ) : null}

        <Pressable
          onPress={mode === 'setPin' ? handleSetPin : handleVerifyPin}
          disabled={confirmDisabled}
          style={({ pressed }) => [
            styles.pinConfirmButton,
            { backgroundColor: c.brand },
            confirmDisabled && { opacity: 0.5 },
            pressed && { opacity: 0.75 },
          ]}
          accessibilityRole="button"
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.pinConfirmLabel}>{t('workMode.pinConfirm')}</Text>
          )}
        </Pressable>

        <Pressable
          onPress={cancelPin}
          style={styles.pinCancelButton}
          accessibilityRole="button"
        >
          <Text style={[styles.pinCancelLabel, { color: c.textSecondary }]}>
            {t('workMode.pinCancel')}
          </Text>
        </Pressable>
      </View>
    );
  };

  const renderList = () => {
    if (loading) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={c.brand} />
          <Text style={[styles.loadingText, { color: c.textTertiary }]}>
            {t('workMode.loading')}
          </Text>
        </View>
      );
    }

    if (businesses.length === 0) {
      return (
        <View style={styles.center}>
          <IconBriefcase size={48} color={c.textTertiary} strokeWidth={1.5} />
          <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>
            {t('workMode.empty')}
          </Text>
          <Text style={[styles.emptySub, { color: c.textTertiary }]}>
            {t('workMode.emptySub')}
          </Text>
        </View>
      );
    }

    return (
      <ScrollView
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {businesses.map((b) => (
          <View
            key={b.business_id}
            style={[
              styles.businessCard,
              { backgroundColor: c.bgSurface, borderColor: c.borderSubtle },
            ]}
          >
            <View style={styles.cardIcon}>
              <IconBriefcase size={22} color={c.brand} strokeWidth={2} />
            </View>
            <View style={styles.cardBody}>
              <Text style={[styles.cardName, { color: c.textPrimary }]}>
                {b.business_name}
              </Text>
              <Text style={[styles.cardRole, { color: c.textTertiary }]}>
                {t('workMode.roleLabel', { role: b.role })}
              </Text>
            </View>
            <Pressable
              onPress={() => (b.has_pin ? openVerifyPin(b) : openSetPin(b))}
              style={({ pressed }) => [
                styles.cardAction,
                { backgroundColor: c.brand },
                pressed && { opacity: 0.75 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                b.has_pin ? t('workMode.accessButton') : t('workMode.setPinButton')
              }
            >
              {b.has_pin ? (
                <IconLock size={15} color="#fff" strokeWidth={2} />
              ) : (
                <IconKeyboard size={15} color="#fff" strokeWidth={2} />
              )}
              <Text style={styles.cardActionLabel}>
                {b.has_pin ? t('workMode.accessButton') : t('workMode.setPinButton')}
              </Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.screen, { backgroundColor: c.bgBase }]}>
      <StatusBar
        barStyle={c.bgBase === palette.bgBase ? 'light-content' : 'dark-content'}
      />
      {renderHeader()}
      {mode === 'list' ? renderList() : renderPinForm()}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const H_PAD = 16;

const styles = StyleSheet.create({
  screen: { flex: 1 },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: H_PAD,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  backButton: {
    marginRight: 8,
    padding: 4,
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
  },

  // ── Loading / empty ────────────────────────────────────────────────────────
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },

  loadingText: {
    fontSize: 14,
    marginTop: 8,
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },

  emptySub: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── Business list ──────────────────────────────────────────────────────────
  list: {
    paddingTop: 16,
    paddingHorizontal: H_PAD,
    gap: 12,
  },

  businessCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 12,
  },

  cardIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  cardBody: {
    flex: 1,
  },

  cardName: {
    fontSize: 16,
    fontWeight: '600',
  },

  cardRole: {
    fontSize: 13,
    marginTop: 2,
  },

  cardAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },

  cardActionLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },

  // ── PIN form ───────────────────────────────────────────────────────────────
  pinContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },

  pinBusiness: {
    fontSize: 16,
    fontWeight: '600',
  },

  pinSubtitle: {
    fontSize: 14,
  },

  pinInput: {
    width: '100%',
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 24,
    letterSpacing: 8,
    textAlign: 'center',
  },

  pinError: {
    fontSize: 13,
    textAlign: 'center',
  },

  pinConfirmButton: {
    width: '100%',
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  pinConfirmLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  pinCancelButton: {
    paddingVertical: 8,
  },

  pinCancelLabel: {
    fontSize: 15,
  },
});
