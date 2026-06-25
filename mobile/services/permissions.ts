/**
 * JChat 3.0 — Chat permissions helper (migration 022 / Task 2.9 extension)
 *
 * Returns the effective permissions of a user in a given business chat room.
 *
 * Resolution order:
 *   1. Owner (businesses.owner_id === userId) → all permissions true.
 *   2. Employee with custom_role_id → permissions from custom_roles.permissions (jsonb).
 *   3. Employee with a fixed role → template mapping below.
 *   4. Non-employee → all false.
 *   5. Any error → all false (secure default).
 *
 * // TODO: extender a moderación con el mismo helper (chat_moderate, chat_ban, etc.)
 */

import { supabase } from './supabase';

// ── Permission keys (must match custom_roles.permissions jsonb keys) ──────────

export type PermissionKey =
  | 'orders_view'
  | 'orders_process'
  | 'orders_mark_delivered'
  | 'orders_assigned_only'
  | 'kds_view'
  | 'kds_mark_ready'
  | 'menu_edit'
  | 'inventory_manage'
  | 'offers_manage'
  | 'availability_toggle'
  | 'chat_moderate'
  | 'chat_ban'
  | 'chat_pin'
  | 'rooms_passwords'
  | 'rooms_manage'
  | 'service_receive'
  | 'alerts_view'
  | 'reservations_manage'
  | 'reports_view'
  | 'analytics_view'
  | 'exports_manage'
  | 'loyalty_manage';

export type ChatPermissions = Record<PermissionKey, boolean>;

export const EMPTY_PERMISSIONS: ChatPermissions = {
  orders_view: false,
  orders_process: false,
  orders_mark_delivered: false,
  orders_assigned_only: false,
  kds_view: false,
  kds_mark_ready: false,
  menu_edit: false,
  inventory_manage: false,
  offers_manage: false,
  availability_toggle: false,
  chat_moderate: false,
  chat_ban: false,
  chat_pin: false,
  rooms_passwords: false,
  rooms_manage: false,
  service_receive: false,
  alerts_view: false,
  reservations_manage: false,
  reports_view: false,
  analytics_view: false,
  exports_manage: false,
  loyalty_manage: false,
};

const ALL_PERMISSIONS = Object.keys(EMPTY_PERMISSIONS) as PermissionKey[];

function fromPartial(partial: Partial<Record<string, boolean>>): ChatPermissions {
  return ALL_PERMISSIONS.reduce(
    (acc, k) => ({ ...acc, [k]: partial[k] ?? false }),
    {} as ChatPermissions,
  );
}

// ── Fixed role → permission mapping (mirrors BASE_TEMPLATES in the dashboard) ──

const FIXED_ROLE_PERMS: Record<string, Partial<Record<PermissionKey, boolean>>> = {
  Manager: {
    orders_view: true, orders_process: true, orders_mark_delivered: true,
    kds_view: true, kds_mark_ready: true, menu_edit: true, inventory_manage: true,
    offers_manage: true, availability_toggle: true, chat_moderate: true, chat_ban: true,
    chat_pin: true, rooms_passwords: true, rooms_manage: true, service_receive: true,
    alerts_view: true, reservations_manage: true, reports_view: true, analytics_view: true,
  },
  Cashier:          { orders_view: true, orders_process: true, reports_view: true },
  Waiter:           { orders_mark_delivered: true, orders_assigned_only: true, service_receive: true },
  Kitchen:          { kds_view: true, kds_mark_ready: true },
  'Chat Moderator': { chat_moderate: true, chat_ban: true, chat_pin: true },
  Analyst:          { analytics_view: true, reports_view: true },
};

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Resolve the effective permissions for `userId` in `businessId`.
 * Always resolves — never rejects. Returns EMPTY_PERMISSIONS on any error.
 */
export async function getChatPermissions({
  businessId,
  userId,
}: {
  businessId: string;
  userId: string;
}): Promise<ChatPermissions> {
  try {
    // 1. Owner check
    const { data: biz } = await supabase
      .from('businesses')
      .select('owner_id')
      .eq('id', businessId)
      .maybeSingle();

    if (biz?.owner_id === userId) {
      return fromPartial(Object.fromEntries(ALL_PERMISSIONS.map((k) => [k, true])));
    }

    // 2. Employee lookup
    const { data: emp } = await supabase
      .from('employees')
      .select('role, custom_role_id')
      .eq('business_id', businessId)
      .eq('user_id', userId)
      .eq('status', 'accepted')
      .maybeSingle();

    if (!emp) return EMPTY_PERMISSIONS;

    // 3a. Custom role → jsonb permissions
    const empAny = emp as { role: string; custom_role_id: string | null };
    if (empAny.custom_role_id) {
      const { data: cr } = await supabase
        .from('custom_roles')
        .select('permissions')
        .eq('id', empAny.custom_role_id)
        .maybeSingle();

      if (cr?.permissions) {
        return fromPartial(cr.permissions as Record<string, boolean>);
      }
    }

    // 3b. Fixed role template
    const template = FIXED_ROLE_PERMS[empAny.role];
    return template ? fromPartial(template) : EMPTY_PERMISSIONS;
  } catch {
    return EMPTY_PERMISSIONS;
  }
}
