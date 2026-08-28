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

// ─── TCP send ─────────────────────────────────────────────────────────────────

const CONNECT_TIMEOUT_MS = 5_000;
const WRITE_TIMEOUT_MS   = 8_000;

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
    let settled = false;

    function settle(err?: Error) {
      if (settled) return;
      settled = true;
      if (connectTimer) clearTimeout(connectTimer);
      if (writeTimer)   clearTimeout(writeTimer);
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
          // Data written — close gracefully.
          client.end();
          settle();
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
