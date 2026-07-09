/**
 * JChat 3.0 — AddEmployeeSheet (Task 2.9)
 *
 * A bottom-anchored modal that lets the business owner invite a user to their
 * staff roster directly from a chat room interaction (e.g. long-press on a
 * user's message or avatar).
 *
 * UX flow:
 *   1. Owner long-presses a user in chat → parent passes targetUserId + businessId.
 *   2. This sheet opens (visible=true) — the role picker shows 6 available roles.
 *   3. Owner picks a role and taps "Send Invite".
 *   4a. Success → addEmployee() creates a pending record + stubs a push notification.
 *        onAdded() is called; the sheet closes.
 *   4b. Plan limit hit → inline error shown (no dismiss).
 *   4c. Already exists → inline error.
 *
 * Security / scope notes:
 *   - isOwner prop controls whether the component renders at all.
 *   - Role determines which chat actions are available to the invitee
 *     (enforced in Task 2.10 — UserActionSheet).
 *   - Physical-presence check for Chat Moderator is Stage 4 (geofence).
 *     // TODO(Stage 4): geofence check for Chat Moderator role
 *
 * Colors: useThemeColors() only — no hardcoded hex.
 * Icons: @tabler/icons-react-native.
 */

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import {
  IconBriefcase,
  IconCheck,
  IconChevronRight,
  IconUserPlus,
  IconX,
} from '@tabler/icons-react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../theme/colors';
import { addEmployee, EMPLOYEE_ROLES } from '../../services/employees';
import type { EmployeeRole } from '../../services/employees';
import type { ThemeColors } from '../../theme/colors';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface AddEmployeeSheetProps {
  /** Controls whether the modal is shown. */
  visible: boolean;
  /** UUID of the user to be invited. */
  targetUserId: string;
  /** UUID of the business whose owner is issuing the invite. */
  businessId: string;
  /**
   * Must be true for the sheet to render content.
   * Only the business owner may add employees — pass false and the sheet
   * stays invisible even if visible=true.
   */
  isOwner: boolean;
  /** Called when the sheet is dismissed without adding. */
  onClose: () => void;
  /** Called after a successful invite is sent, with the new employee id. */
  onAdded: (employeeId: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AddEmployeeSheet({
  visible,
  targetUserId,
  businessId,
  isOwner,
  onClose,
  onAdded,
}: AddEmployeeSheetProps) {
  const c = useThemeColors();
  const { t } = useTranslation('chat');
  const s = makeStyles(c);

  const [selectedRole, setSelectedRole] = useState<EmployeeRole | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Reset state each open
  const handleOpen = useCallback(() => {
    setSelectedRole(null);
    setLoading(false);
    setErrorMsg(null);
    setSuccess(false);
  }, []);

  const handleClose = useCallback(() => {
    if (loading) return; // Block dismiss while in-flight
    onClose();
  }, [loading, onClose]);

  const handleSendInvite = useCallback(async () => {
    if (!selectedRole || loading || success) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const result = await addEmployee(businessId, targetUserId, selectedRole);
      if (result.ok) {
        setSuccess(true);
        onAdded(result.employee.id);
        // Brief success flash, then close
        setTimeout(() => {
          onClose();
        }, 800);
      } else {
        switch (result.reason) {
          case 'plan_limit':
            setErrorMsg(result.message ?? t('employee.errorPlanLimit'));
            break;
          case 'already_exists':
            setErrorMsg(result.message ?? t('employee.errorAlreadyExists'));
            break;
          case 'not_configured':
            setErrorMsg(t('employee.errorNotConfigured'));
            break;
          case 'db_error':
          default:
            setErrorMsg(result.message ?? t('employee.errorGeneric'));
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t('employee.errorGenericShort'));
    } finally {
      setLoading(false);
    }
  }, [selectedRole, loading, success, businessId, targetUserId, onAdded, onClose]);

  // Non-owners see nothing
  if (!isOwner) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
      onShow={handleOpen}
    >
      {/* Scrim */}
      <TouchableWithoutFeedback onPress={handleClose} accessible={false}>
        <View style={s.scrim} />
      </TouchableWithoutFeedback>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={s.avoidingView}
        pointerEvents="box-none"
      >
        <View style={s.sheet}>
          {/* Drag handle */}
          <View style={s.handle} />

          {/* Header */}
          <View style={s.header}>
            <View style={s.iconWrap}>
              {success ? (
                <IconCheck size={22} color={c.success} />
              ) : (
                <IconUserPlus size={22} color={c.brand} />
              )}
            </View>
            <View style={s.headerText}>
              <Text style={s.title}>
                {success ? t('employee.inviteSentTitle') : t('employee.title')}
              </Text>
              {!success && (
                <Text style={s.subtitle}>
                  {t('employee.subtitle')}
                </Text>
              )}
            </View>
            {/* Close button */}
            <Pressable
              onPress={handleClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('actions.close', { ns: 'common' })}
              disabled={loading}
              style={({ pressed }) => [s.closeBtn, pressed && s.closeBtnPressed]}
            >
              <IconX size={20} color={c.textSecondary} />
            </Pressable>
          </View>

          {/* Role list */}
          {!success && (
            <ScrollView
              style={s.roleList}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {EMPLOYEE_ROLES.map((role) => {
                const isSelected = selectedRole === role;
                return (
                  <Pressable
                    key={role}
                    onPress={() => {
                      setSelectedRole(role);
                      setErrorMsg(null);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={role}
                    style={({ pressed }) => [
                      s.roleRow,
                      isSelected && s.roleRowSelected,
                      pressed && !isSelected && s.roleRowPressed,
                    ]}
                  >
                    <View style={s.roleRowLeft}>
                      <View
                        style={[
                          s.roleIconWrap,
                          isSelected && s.roleIconWrapSelected,
                        ]}
                      >
                        <IconBriefcase
                          size={16}
                          color={isSelected ? c.bgSurface : c.textSecondary}
                        />
                      </View>
                      <Text
                        style={[
                          s.roleLabel,
                          isSelected && s.roleLabelSelected,
                        ]}
                      >
                        {role}
                      </Text>
                    </View>
                    {isSelected ? (
                      <IconCheck size={18} color={c.brand} />
                    ) : (
                      <IconChevronRight size={16} color={c.textTertiary} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {/* Success state note */}
          {success && (
            <View style={s.successNote}>
              <Text style={s.successText}>
                {t('employee.successNote')}
              </Text>
            </View>
          )}

          {/* Inline error */}
          {!!errorMsg && (
            <Text style={s.errorText} accessibilityRole="alert">
              {errorMsg}
            </Text>
          )}

          {/* CTA */}
          {!success && (
            <Pressable
              onPress={handleSendInvite}
              disabled={!selectedRole || loading}
              accessibilityRole="button"
              accessibilityLabel={t('employee.sendInviteA11y')}
              accessibilityState={{ disabled: !selectedRole || loading }}
              style={({ pressed }) => [
                s.ctaBtn,
                (!selectedRole || loading) && s.ctaBtnDisabled,
                pressed && selectedRole && !loading && s.ctaBtnPressed,
              ]}
            >
              {loading ? (
                <ActivityIndicator size="small" color={c.bgSurface} />
              ) : (
                <Text style={s.ctaBtnLabel}>
                  {selectedRole ? t('employee.inviteAs', { role: selectedRole }) : t('employee.selectRole')}
                </Text>
              )}
            </Pressable>
          )}

          {/* Cancel link */}
          {!success && (
            <Pressable
              onPress={handleClose}
              hitSlop={8}
              accessibilityRole="button"
              disabled={loading}
              style={s.cancelWrap}
            >
              <Text style={s.cancelText}>{t('actions.cancel', { ns: 'common' })}</Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    scrim: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    avoidingView: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: c.bgSurface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 36,
      borderTopWidth: 1,
      borderTopColor: c.borderSubtle,
      maxHeight: '80%',
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.borderSubtle,
      alignSelf: 'center',
      marginBottom: 16,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 20,
    },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.brandLight,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    headerText: {
      flex: 1,
    },
    title: {
      color: c.textPrimary,
      fontSize: 16,
      fontWeight: '700',
    },
    subtitle: {
      color: c.textSecondary,
      fontSize: 13,
      marginTop: 2,
    },
    closeBtn: {
      padding: 6,
      borderRadius: 8,
    },
    closeBtnPressed: {
      backgroundColor: c.bgOverlay,
    },

    // Role list
    roleList: {
      maxHeight: 310,
      marginBottom: 12,
    },
    roleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 13,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.borderSubtle,
      marginBottom: 8,
      backgroundColor: c.bgElevated,
    },
    roleRowSelected: {
      borderColor: c.brand,
      backgroundColor: c.brandLight,
    },
    roleRowPressed: {
      opacity: 0.75,
    },
    roleRowLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    roleIconWrap: {
      width: 30,
      height: 30,
      borderRadius: 8,
      backgroundColor: c.bgOverlay,
      alignItems: 'center',
      justifyContent: 'center',
    },
    roleIconWrapSelected: {
      backgroundColor: c.brand,
    },
    roleLabel: {
      color: c.textPrimary,
      fontSize: 14,
      fontWeight: '500',
    },
    roleLabelSelected: {
      fontWeight: '700',
      color: c.brand,
    },

    // Success
    successNote: {
      backgroundColor: c.bgElevated,
      borderRadius: 12,
      padding: 14,
      marginBottom: 16,
    },
    successText: {
      color: c.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
    },

    // Error
    errorText: {
      color: c.danger,
      fontSize: 13,
      marginBottom: 8,
      marginHorizontal: 2,
    },

    // CTA button
    ctaBtn: {
      backgroundColor: c.brand,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 50,
      marginTop: 4,
    },
    ctaBtnDisabled: {
      opacity: 0.45,
    },
    ctaBtnPressed: {
      opacity: 0.82,
    },
    ctaBtnLabel: {
      color: c.bgSurface,
      fontSize: 15,
      fontWeight: '700',
      letterSpacing: 0.2,
    },

    // Cancel
    cancelWrap: {
      alignItems: 'center',
      marginTop: 14,
    },
    cancelText: {
      color: c.textSecondary,
      fontSize: 15,
    },
  });
}
