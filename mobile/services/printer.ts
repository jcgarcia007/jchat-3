/**
 * JChat 3.0 — Network printer service
 *
 * Sends a raw ESC/POS buffer to a TCP printer on the local network.
 * Uses react-native-tcp-socket for the raw TCP connection.
 *
 * ⚠️  This module requires a native rebuild — react-native-tcp-socket is
 *     a native module (added to app.config.ts plugins).
 *
 * Usage:
 *   import { printToNetwork, fetchDefaultPrinter } from './printer';
 *
 *   const printer = await fetchDefaultPrinter(businessId);
 *   const bytes   = buildReceiptEscPos(receipt, code, printer.width_mm);
 *   await printToNetwork(printer.host, printer.port, bytes);
 */

import TcpSocket from 'react-native-tcp-socket';
import { supabase } from './supabase';
import { buildKitchenTicketEscPos } from './escpos';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NetworkPrinter {
  id: string;
  label: string;
  host: string;
  port: number;
  width_mm: number;
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

/**
 * Fetch the default active network printer for a business.
 * Returns null if none is configured — the caller must handle this gracefully.
 */
export async function fetchDefaultPrinter(businessId: string): Promise<NetworkPrinter | null> {
  const { data, error } = await supabase
    .from('pos_printers')
    .select('id, label, host, port, width_mm')
    .eq('business_id', businessId)
    .eq('connection', 'network')
    .eq('is_active', true)
    .eq('is_default', true)
    .single();

  if (error || !data || !data.host) return null;

  return {
    id:       data.id,
    label:    data.label,
    host:     data.host,
    port:     data.port ?? 9100,
    width_mm: data.width_mm ?? 80,
  };
}

/**
 * Fetch the first active network printer for a business (fallback when
 * no default is set — useful if there's only one printer configured).
 */
export async function fetchAnyPrinter(businessId: string): Promise<NetworkPrinter | null> {
  const { data, error } = await supabase
    .from('pos_printers')
    .select('id, label, host, port, width_mm')
    .eq('business_id', businessId)
    .eq('connection', 'network')
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .limit(1)
    .single();

  if (error || !data || !data.host) return null;

  return {
    id:       data.id,
    label:    data.label,
    host:     data.host,
    port:     data.port ?? 9100,
    width_mm: data.width_mm ?? 80,
  };
}

// ─── Station printer helpers ──────────────────────────────────────────────────

/**
 * Fetches the active printer for a given station role.
 * Returns null if no printer is configured or is_active = false.
 */
export async function fetchPrinterByRole(
  businessId: string,
  role: 'kitchen' | 'bar',
): Promise<{ host: string; port: number; widthMm: number } | null> {
  const { data, error } = await supabase
    .from('pos_printers')
    .select('host, port, width_mm')
    .eq('business_id', businessId)
    .eq('role', role)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data || !data.host) return null;

  return {
    host:    data.host,
    port:    data.port ?? 9100,
    widthMm: data.width_mm ?? 80,
  };
}

/**
 * Resolves the name to print as "Mesero:" on a commanda for the current user.
 * Same precedence as the receipt RPC (migration 157):
 *   employees.receipt_display_name → users.display_name → null
 * The second step covers business owners, who may not have an employees row.
 * Best-effort: never throws.
 */
export async function resolveServerName(businessId: string): Promise<string | null> {
  try {
    const uid = (await supabase.auth.getUser()).data.user?.id;
    if (!uid) return null;

    const { data: emp } = await supabase
      .from('employees')
      .select('receipt_display_name')
      .eq('user_id', uid)
      .eq('business_id', businessId)
      .maybeSingle();
    if (emp?.receipt_display_name) return emp.receipt_display_name;

    const { data: usr } = await supabase
      .from('users')
      .select('display_name')
      .eq('id', uid)
      .maybeSingle();
    return usr?.display_name ?? null;
  } catch {
    return null;
  }
}

// ─── Internal type for order_items query ─────────────────────────────────────

interface KitchenOrderItem {
  qty: number;
  seat: number | null;
  special_instructions: string | null;
  options: string | null;
  menu_items: {
    name: string;
    station: string | null;
  };
}

/**
 * Prints kitchen and/or bar commandas for a given order.
 * Always isolated in try/catch — NEVER throws or blocks the caller.
 */
export async function printKitchenTickets(opts: {
  businessId: string;
  orderId: string;
  tableLabel: string;
  serverName: string | null;
}): Promise<void> {
  try {
    const { businessId, orderId, tableLabel, serverName } = opts;

    // 1. Fetch order items with station info
    const { data, error } = await supabase
      .from('order_items')
      .select('qty, seat, special_instructions, options, menu_items!inner(name, station)')
      .eq('order_id', orderId);

    if (error || !data) {
      console.warn('[printKitchenTickets] could not fetch order items:', error?.message);
      return;
    }

    const rows = data as unknown as KitchenOrderItem[];

    // 2. Group by station — items with null/unknown station are ignored
    const groups: Record<'kitchen' | 'bar', KitchenOrderItem[]> = {
      kitchen: [],
      bar:     [],
    };
    for (const row of rows) {
      const st = row.menu_items?.station;
      if (st === 'kitchen' || st === 'bar') {
        groups[st].push(row);
      }
    }

    // 3. Print per station, each in its own try/catch
    const stationMeta: Array<{ role: 'kitchen' | 'bar'; label: string }> = [
      { role: 'kitchen', label: 'COCINA' },
      { role: 'bar',     label: 'BAR'    },
    ];

    for (const { role, label } of stationMeta) {
      const stationItems = groups[role];
      if (stationItems.length === 0) continue;

      try {
        const printer = await fetchPrinterByRole(businessId, role);
        if (!printer) continue; // station not configured — skip silently

        const escposBuffer = buildKitchenTicketEscPos({
          stationLabel: label,
          tableLabel,
          serverName,
          items: stationItems.map((r) => ({
            qty:                  r.qty,
            name:                 r.menu_items.name,
            options:              typeof r.options === 'string'
                                    ? r.options
                                    : r.options != null
                                      ? JSON.stringify(r.options)
                                      : null,
            special_instructions: r.special_instructions,
            seat:                 r.seat,
          })),
        });

        await printToNetwork(printer.host, printer.port, escposBuffer);
      } catch (stationErr) {
        console.warn(`[printKitchenTickets] ${role} print failed:`, stationErr);
        // continue to next station
      }
    }
  } catch (e) {
    console.warn('[printKitchenTickets] error:', e);
    // never throws
  }
}

// ─── TCP send ─────────────────────────────────────────────────────────────────

const CONNECT_TIMEOUT_MS = 5_000;
const WRITE_TIMEOUT_MS   = 8_000;
// Grace period between the write callback and end(). The callback only means
// the bytes reached the kernel send buffer; the printer may still be consuming
// them. Closing at once can make a printer that emits status bytes (ASB) get
// an RST and discard unprocessed input — the tail (feed + cut) goes first.
const CLOSE_GRACE_MS     = 400;

/**
 * Open a TCP socket to host:port, write `bytes`, then close.
 *
 * Throws on:
 *  - Connection timeout (printer off / wrong IP)
 *  - Write timeout (printer hung)
 *  - Any socket error
 *
 * The caller is responsible for catching and displaying the error.
 * This function NEVER touches the payment state.
 */
export function printToNetwork(
  host: string,
  port: number,
  bytes: Uint8Array,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let connectTimer: ReturnType<typeof setTimeout> | null = null;
    let writeTimer:   ReturnType<typeof setTimeout> | null = null;
    let graceTimer:   ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    function settle(err?: Error) {
      if (settled) return;
      settled = true;
      if (connectTimer) clearTimeout(connectTimer);
      if (writeTimer)   clearTimeout(writeTimer);
      if (graceTimer)   clearTimeout(graceTimer);
      // Destroy the socket regardless of outcome to free the port handle.
      try { client.destroy(); } catch { /* ignore */ }
      err ? reject(err) : resolve();
    }

    const client = TcpSocket.createConnection(
      { host, port, tls: false },
      () => {
        // Connected — clear the connect timer, arm the write timer.
        if (connectTimer) clearTimeout(connectTimer);

        writeTimer = setTimeout(() => {
          settle(new Error(`Print write timed out after ${WRITE_TIMEOUT_MS / 1000}s`));
        }, WRITE_TIMEOUT_MS);

        client.write(bytes as unknown as string, 'binary', (err) => {
          if (err) { settle(err); return; }
          // Data written — let the printer drain before closing. The write
          // timer still caps the whole operation; 'error'/'close' still settle.
          graceTimer = setTimeout(() => {
            if (settled) return; // 'close'/'error'/timeout already handled it
            client.end();
            settle();
          }, CLOSE_GRACE_MS);
        });
      },
    );

    // Arm connect timeout.
    connectTimer = setTimeout(() => {
      settle(new Error(`Could not connect to printer at ${host}:${port} — is it powered on?`));
    }, CONNECT_TIMEOUT_MS);

    client.on('error', (err) => settle(err instanceof Error ? err : new Error(String(err))));
    client.on('close', () => settle()); // normal close after end()
  });
}
