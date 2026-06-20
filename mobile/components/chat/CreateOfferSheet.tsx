/**
 * JChat 3.0 — CreateOfferSheet (Task 2.6)
 *
 * Bottom-anchored modal that lets the business owner create a new offer
 * and broadcast it to one or more chat rooms.
 *
 * UX flow:
 *   1. Owner taps the offer button in the chat toolbar → parent opens this sheet.
 *   2. Owner picks an offer type (2×2 grid), fills in the fields, selects a
 *      duration, and picks one or more target rooms.
 *   3. On "Post Offer":
 *      a. Insert a row into `offers` with all fields + expires_at.
 *      b. For each selected room, insert an `offer` message into `messages`
 *         (type='offer', metadata contains offer_id) so the offer card appears
 *         in the chat timeline.
 *      c. If duration > 0, also insert a `pinned_messages` row that references
 *         the new message, so the offer surfaces in the pinned banner.
 *      d. Call onCreated() → parent closes the sheet and refreshes the room.
 *
 * Notes:
 *   - Guard every Supabase call with `isSupabaseConfigured`.
 *   - `rooms` prop provides the room list with live user counts.
 *   - Owner gating lives in the parent; this component renders unconditionally.
 *   - Colors: useThemeColors() only — no hardcoded hex.
 *   - Icons: @tabler/icons-react-native.
 *   - // TODO(i18n)
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import {
  IconCheck,
  IconChevronDown,
  IconCrown,
  IconGift,
  IconPercentage,
  IconTag,
  IconUsers,
  IconX,
} from '@tabler/icons-react-native';
import { useThemeColors } from '../../theme/colors';
import type { ThemeColors } from '../../theme/colors';
import type { ChatTheme } from '../../theme/chatThemes';
import { supabase, isSupabaseConfigured } from '../../services/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

export type OfferType = 'discount' | 'bundle' | 'happy_hour' | 'free_item';

export interface RoomSummary {
  /** UUID of the room. */
  id: string;
  /** Display name shown in the room selector. */
  name: string;
  /** Current live user count for display. */
  activeUserCount?: number;
}

export interface CreateOfferSheetProps {
  visible: boolean;
  /** UUID of the owning business. */
  businessId: string;
  /** UUID of the room that triggered the sheet (pre-selected). */
  roomId: string;
  /** All rooms belonging to this business (for the multi-room selector). */
  rooms: RoomSummary[];
  /** UUID of the authenticated owner (maps to messages.user_id + offers.created_by). */
  createdBy: string;
  /** Chat theme of the current room (passed through for tint consistency). */
  theme: ChatTheme;
  onClose: () => void;
  /** Called after the offer(s) are successfully inserted. */
  onCreated: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

interface OfferTypeOption {
  value: OfferType;
  label: string;   // TODO(i18n)
  emoji: string;
}

const OFFER_TYPES: OfferTypeOption[] = [
  { value: 'discount',    label: 'Discount',    emoji: '%'  },
  { value: 'bundle',      label: '2×1 Bundle',  emoji: '🎁' },
  { value: 'happy_hour',  label: 'Happy Hour',  emoji: '🍺' },
  { value: 'free_item',   label: 'Free Item',   emoji: '🎉' },
];

interface DurationOption {
  label: string;  // TODO(i18n)
  /** Duration in hours. 0 = no expiry / no pin. */
  hours: number;
  /** Sentinel for custom date-picker (not yet wired — Stage 3). */
  custom?: true;
}

const DURATION_OPTIONS: DurationOption[] = [
  { label: '1 hour',   hours: 1  },
  { label: '2 hours',  hours: 2  },
  { label: 'Tonight',  hours: 8  },
  { label: 'Custom',   hours: 0, custom: true },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

/** Return ISO timestamp for the end of the current calendar day (23:59:59 local). */
function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function expiresAtForDuration(opt: DurationOption): string | null {
  if (opt.custom) return null; // TODO(Task 3.x): custom date picker
  if (opt.label === 'Tonight') return endOfToday().toISOString();
  if (opt.hours > 0) return addHours(new Date(), opt.hours).toISOString();
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CreateOfferSheet({
  visible,
  businessId,
  roomId,
  rooms,
  createdBy,
  onClose,
  onCreated,
}: CreateOfferSheetProps) {
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [offerType, setOfferType]         = useState<OfferType>('discount');
  const [title, setTitle]                 = useState('');
  const [discount, setDiscount]           = useState('');
  const [minPurchase, setMinPurchase]     = useState('');
  const [description, setDescription]    = useState('');
  const [durationIdx, setDurationIdx]     = useState<number>(0);
  const [selectedRooms, setSelectedRooms] = useState<Set<string>>(new Set([roomId]));
  const [loading, setLoading]             = useState(false);
  const [errorMsg, setErrorMsg]           = useState<string | null>(null);

  // Reset form each time the sheet opens
  useEffect(() => {
    if (visible) {
      setOfferType('discount');
      setTitle('');
      setDiscount('');
      setMinPurchase('');
      setDescription('');
      setDurationIdx(0);
      setSelectedRooms(new Set([roomId]));
      setLoading(false);
      setErrorMsg(null);
    }
  }, [visible, roomId]);

  // ── Room toggle ─────────────────────────────────────────────────────────────
  const toggleRoom = useCallback((id: string) => {
    setSelectedRooms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handlePost = useCallback(async () => {
    if (loading) return;

    if (!title.trim()) {
      setErrorMsg('Please add a title for the offer.'); // TODO(i18n)
      return;
    }
    if (selectedRooms.size === 0) {
      setErrorMsg('Select at least one room.'); // TODO(i18n)
      return;
    }

    if (!isSupabaseConfigured) {
      // Demo mode — just close and call onCreated as if it worked
      onCreated();
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const duration = DURATION_OPTIONS[durationIdx];
      const expiresAt = expiresAtForDuration(duration);
      const minCents = minPurchase.trim()
        ? Math.round(parseFloat(minPurchase.replace(/[^0-9.]/g, '')) * 100)
        : null;

      const roomIds = Array.from(selectedRooms);

      // Insert one offer row (tied to the first selected room — or null if many)
      const primaryRoomId = roomIds[0] ?? roomId;

      const { data: offerRow, error: offerErr } = await supabase
        .from('offers')
        .insert({
          business_id:       businessId,
          room_id:           primaryRoomId,
          title:             title.trim(),
          discount:          discount.trim() || null,
          min_purchase_cents: minCents,
          description:       description.trim() || null,
          expires_at:        expiresAt,
          type:              offerType,
          created_by:        createdBy,
          is_active:         true,
        })
        .select('id')
        .single();

      if (offerErr || !offerRow) {
        throw new Error(offerErr?.message ?? 'Failed to create offer.');
      }

      const offerId: string = offerRow.id as string;

      // For each selected room: insert an offer message + optional pin
      for (const rid of roomIds) {
        // 1. Insert offer message into the chat timeline
        const { data: msgRow, error: msgErr } = await supabase
          .from('messages')
          .insert({
            room_id:   rid,
            user_id:   createdBy,
            body:      title.trim(),
            type:      'offer',
            is_system: false,
            // Snapshot offer fields so MessageBubble/OfferCard render without a fetch.
            metadata:  {
              offer_id:           offerId,
              title:              title.trim(),
              discount:           discount.trim() || null,
              description:        description.trim() || null,
              expires_at:         expiresAt,
              offer_type:         offerType,
              min_purchase_cents: minCents,
              created_by:         createdBy,
              business_id:        businessId,
            },
          })
          .select('id')
          .single();

        if (msgErr || !msgRow) {
          // Non-fatal: the offer is created; the message failed — log and continue
          console.warn('[CreateOfferSheet] message insert failed:', msgErr?.message);
          continue;
        }

        const messageId: string = msgRow.id as string;

        // 2. Pin the offer message if a real duration was selected
        if (expiresAt !== null) {
          const { error: pinErr } = await supabase
            .from('pinned_messages')
            .insert({
              room_id:    rid,
              message_id: messageId,
              pinned_by:  createdBy,
              expires_at: expiresAt,
              notify:     true,
            });

          if (pinErr) {
            console.warn('[CreateOfferSheet] pin insert failed:', pinErr.message);
          }
        }
      }

      onCreated();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong.'); // TODO(i18n)
    } finally {
      setLoading(false);
    }
  }, [
    loading, title, discount, minPurchase, description,
    durationIdx, selectedRooms, businessId, roomId, offerType, createdBy,
    onCreated,
  ]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Scrim */}
      <TouchableWithoutFeedback onPress={onClose} accessible={false}>
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
          <View style={s.headerRow}>
            <View style={s.headerIconWrap}>
              <IconTag size={20} color={c.brand} />
            </View>
            <Text style={s.headerTitle}>Create Offer</Text>{/* TODO(i18n) */}
            <Pressable
              onPress={onClose}
              hitSlop={10}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Close" // TODO(i18n)
              style={({ pressed }) => [s.closeBtn, pressed && s.closeBtnPressed]}
            >
              <IconX size={20} color={c.textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.scrollContent}
          >
            {/* ── Offer type grid (2×2) ── */}
            <Text style={s.sectionLabel}>Offer type</Text>{/* TODO(i18n) */}
            <View style={s.typeGrid}>
              {OFFER_TYPES.map((opt) => {
                const active = offerType === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => setOfferType(opt.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={opt.label}
                    style={({ pressed }) => [
                      s.typeCell,
                      active && s.typeCellActive,
                      pressed && !active && s.typeCellPressed,
                    ]}
                  >
                    <Text style={s.typeEmoji}>{opt.emoji}</Text>
                    <Text style={[s.typeLabel, active && s.typeLabelActive]}>
                      {opt.label}
                    </Text>
                    {active && (
                      <View style={s.typeCheckDot}>
                        <IconCheck size={10} color={c.bgSurface} />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>

            {/* ── Title ── */}
            <Text style={s.sectionLabel}>Title</Text>{/* TODO(i18n) */}
            <TextInput
              style={s.textInput}
              value={title}
              onChangeText={(v) => { setTitle(v); setErrorMsg(null); }}
              placeholder="e.g. Happy Hour 2×1 Drinks" // TODO(i18n)
              placeholderTextColor={c.textTertiary}
              returnKeyType="next"
              maxLength={80}
            />

            {/* ── Discount ── */}
            <Text style={s.sectionLabel}>Discount</Text>{/* TODO(i18n) */}
            <View style={s.inputRow}>
              <IconPercentage size={16} color={c.textSecondary} style={s.inputRowIcon} />
              <TextInput
                style={[s.textInput, s.inputRowField]}
                value={discount}
                onChangeText={setDiscount}
                placeholder="e.g. 20%, $5 off, Buy 1 Get 1" // TODO(i18n)
                placeholderTextColor={c.textTertiary}
                returnKeyType="next"
                maxLength={40}
              />
            </View>

            {/* ── Min purchase ── */}
            <Text style={s.sectionLabel}>Min. purchase (optional)</Text>{/* TODO(i18n) */}
            <TextInput
              style={s.textInput}
              value={minPurchase}
              onChangeText={setMinPurchase}
              placeholder="e.g. $15.00" // TODO(i18n)
              placeholderTextColor={c.textTertiary}
              keyboardType="decimal-pad"
              returnKeyType="next"
              maxLength={10}
            />

            {/* ── Description ── */}
            <Text style={s.sectionLabel}>Description (optional)</Text>{/* TODO(i18n) */}
            <TextInput
              style={[s.textInput, s.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Any extra details, exclusions or conditions…" // TODO(i18n)
              placeholderTextColor={c.textTertiary}
              multiline
              numberOfLines={3}
              returnKeyType="default"
              maxLength={200}
            />

            {/* ── Duration ── */}
            <Text style={s.sectionLabel}>Duration</Text>{/* TODO(i18n) */}
            <View style={s.chipRow}>
              {DURATION_OPTIONS.map((opt, idx) => {
                const active = durationIdx === idx;
                return (
                  <Pressable
                    key={opt.label}
                    onPress={() => setDurationIdx(idx)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    style={({ pressed }) => [
                      s.chip,
                      active && s.chipActive,
                      pressed && !active && s.chipPressed,
                    ]}
                  >
                    {opt.custom && (
                      <IconChevronDown
                        size={13}
                        color={active ? c.bgSurface : c.textSecondary}
                        style={{ marginRight: 4 }}
                      />
                    )}
                    <Text style={[s.chipLabel, active && s.chipLabelActive]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {DURATION_OPTIONS[durationIdx]?.custom && (
              <Text style={s.customNote}>
                {/* TODO(i18n) */}
                Custom date-picker coming in Stage 3.
              </Text>
            )}

            {/* ── Room selector ── */}
            {rooms.length > 1 && (
              <>
                <Text style={s.sectionLabel}>Post to rooms</Text>{/* TODO(i18n) */}
                <View style={s.roomList}>
                  {rooms.map((room) => {
                    const checked = selectedRooms.has(room.id);
                    return (
                      <Pressable
                        key={room.id}
                        onPress={() => toggleRoom(room.id)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked }}
                        style={({ pressed }) => [
                          s.roomRow,
                          checked && s.roomRowChecked,
                          pressed && s.roomRowPressed,
                        ]}
                      >
                        <View
                          style={[s.checkbox, checked && s.checkboxChecked]}
                        >
                          {checked && (
                            <IconCheck size={11} color={c.bgSurface} />
                          )}
                        </View>
                        <Text
                          style={[s.roomName, checked && s.roomNameChecked]}
                          numberOfLines={1}
                        >
                          {room.name}
                        </Text>
                        {(room.activeUserCount ?? 0) > 0 && (
                          <View style={s.userCountBadge}>
                            <IconUsers size={11} color={c.textSecondary} />
                            <Text style={s.userCountText}>
                              {room.activeUserCount}
                            </Text>
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            {/* ── Inline error ── */}
            {!!errorMsg && (
              <Text style={s.errorText} accessibilityRole="alert">
                {errorMsg}
              </Text>
            )}

            {/* ── Post button ── */}
            <Pressable
              onPress={handlePost}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Post offer" // TODO(i18n)
              accessibilityState={{ disabled: loading }}
              style={({ pressed }) => [
                s.postBtn,
                loading && s.postBtnLoading,
                pressed && !loading && s.postBtnPressed,
              ]}
            >
              {loading ? (
                <ActivityIndicator size="small" color={c.bgSurface} />
              ) : (
                <Text style={s.postBtnLabel}>Post Offer</Text>
              )}
            </Pressable>

            {/* ── Cancel ── */}
            <Pressable
              onPress={onClose}
              hitSlop={8}
              disabled={loading}
              accessibilityRole="button"
              style={s.cancelWrap}
            >
              {/* TODO(i18n) */}
              <Text style={s.cancelText}>Cancel</Text>
            </Pressable>
          </ScrollView>
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
      paddingTop: 12,
      paddingHorizontal: 20,
      borderTopWidth: 1,
      borderTopColor: c.borderSubtle,
      maxHeight: '90%',
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.borderSubtle,
      alignSelf: 'center',
      marginBottom: 14,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 16,
    },
    headerIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: c.brandLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      flex: 1,
      color: c.textPrimary,
      fontSize: 17,
      fontWeight: '700',
    },
    closeBtn: {
      padding: 6,
      borderRadius: 8,
    },
    closeBtnPressed: {
      backgroundColor: c.bgOverlay,
    },
    scrollContent: {
      paddingBottom: 40,
    },

    // Section label
    sectionLabel: {
      color: c.textSecondary,
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      marginBottom: 8,
      marginTop: 16,
    },

    // Offer type 2×2 grid
    typeGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    typeCell: {
      width: '47%',
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: c.borderSubtle,
      backgroundColor: c.bgElevated,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      position: 'relative',
    },
    typeCellActive: {
      borderColor: c.brand,
      backgroundColor: c.brandLight,
    },
    typeCellPressed: {
      opacity: 0.7,
    },
    typeEmoji: {
      fontSize: 24,
      marginBottom: 6,
    },
    typeLabel: {
      color: c.textSecondary,
      fontSize: 13,
      fontWeight: '600',
    },
    typeLabelActive: {
      color: c.brand,
    },
    typeCheckDot: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: c.brand,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // Text inputs
    textInput: {
      color: c.textPrimary,
      fontSize: 15,
      backgroundColor: c.bgElevated,
      borderWidth: 1,
      borderColor: c.borderSubtle,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: Platform.OS === 'ios' ? 12 : 9,
    },
    textArea: {
      minHeight: 76,
      textAlignVertical: 'top',
      paddingTop: 10,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.bgElevated,
      borderWidth: 1,
      borderColor: c.borderSubtle,
      borderRadius: 12,
      paddingHorizontal: 14,
    },
    inputRowIcon: {
      marginRight: 6,
    },
    inputRowField: {
      flex: 1,
      borderWidth: 0,
      backgroundColor: 'transparent',
      paddingHorizontal: 0,
    },

    // Duration chips
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1.5,
      borderColor: c.borderSubtle,
      backgroundColor: c.bgElevated,
    },
    chipActive: {
      borderColor: c.brand,
      backgroundColor: c.brand,
    },
    chipPressed: {
      opacity: 0.7,
    },
    chipLabel: {
      color: c.textSecondary,
      fontSize: 13,
      fontWeight: '600',
    },
    chipLabelActive: {
      color: c.bgSurface,
    },
    customNote: {
      color: c.textTertiary,
      fontSize: 12,
      marginTop: 6,
    },

    // Room list
    roomList: {
      gap: 8,
    },
    roomRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 11,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.borderSubtle,
      backgroundColor: c.bgElevated,
    },
    roomRowChecked: {
      borderColor: c.brand,
      backgroundColor: c.brandLight,
    },
    roomRowPressed: {
      opacity: 0.75,
    },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: c.textTertiary,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    checkboxChecked: {
      backgroundColor: c.brand,
      borderColor: c.brand,
    },
    roomName: {
      flex: 1,
      color: c.textPrimary,
      fontSize: 14,
      fontWeight: '500',
    },
    roomNameChecked: {
      color: c.brand,
      fontWeight: '700',
    },
    userCountBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    userCountText: {
      color: c.textSecondary,
      fontSize: 12,
    },

    // Error
    errorText: {
      color: c.danger,
      fontSize: 13,
      marginTop: 10,
      marginLeft: 2,
    },

    // Post button
    postBtn: {
      backgroundColor: c.brand,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 20,
      minHeight: 50,
    },
    postBtnLoading: {
      opacity: 0.7,
    },
    postBtnPressed: {
      opacity: 0.82,
    },
    postBtnLabel: {
      color: c.bgSurface,
      fontSize: 16,
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
