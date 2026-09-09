/**
 * useComandaPrintBridge — Tab POS F3 (D-24)
 *
 * Hook montado una sola vez a nivel del POS (PosNavigator) mientras Work Mode
 * está activo. Suscribe a INSERT en orders filtrado por business_id, detecta
 * órdenes de cliente (source in ['customer_stripe','customer_tab']) y las imprime
 * a cocina/bar con reclamo atómico para evitar duplicados entre handhelds.
 *
 * Montaje: via PosComandaBridgeInit en PosNavigator (patrón PosAlertsInit).
 */

import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { supabase } from '../services/supabase';
import { printKitchenTickets } from '../services/printer';

type PendingComanda = {
  order_id:    string;
  table_label: string | null;
  created_at:  string;
};

const RETRY_DELAY_MS = 30_000; // 30 s antes del reintento único tras fallo de red

export function useComandaPrintBridge(businessId: string): void {
  // Set en memoria: órdenes ya procesadas en esta sesión (anti-duplicado local)
  const processedRef = useRef<Set<string>>(new Set());
  const channelRef   = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── RPC helpers ──────────────────────────────────────────────────────────────

  async function claimPrint(orderId: string): Promise<boolean> {
    const { data, error } = await (supabase as unknown as {
      rpc(fn: 'pos_claim_comanda_print', params: { p_business_id: string; p_order_id: string }):
        Promise<{ data: boolean | null; error: { message: string } | null }>;
    }).rpc('pos_claim_comanda_print', { p_business_id: businessId, p_order_id: orderId });
    if (error) {
      console.warn('[ComandaBridge] claim error:', error.message);
      return false;
    }
    return data === true;
  }

  async function markPrinted(orderId: string): Promise<void> {
    await (supabase as unknown as {
      rpc(fn: 'pos_mark_comanda_printed', params: { p_business_id: string; p_order_id: string }):
        Promise<{ data: null; error: { message: string } | null }>;
    }).rpc('pos_mark_comanda_printed', { p_business_id: businessId, p_order_id: orderId });
  }

  async function releasePrint(orderId: string): Promise<void> {
    await (supabase as unknown as {
      rpc(fn: 'pos_release_comanda_print', params: { p_business_id: string; p_order_id: string }):
        Promise<{ data: null; error: { message: string } | null }>;
    }).rpc('pos_release_comanda_print', { p_business_id: businessId, p_order_id: orderId });
  }

  // ── tryPrint ─────────────────────────────────────────────────────────────────

  async function tryPrint(orderId: string, tableLabel: string | null): Promise<void> {
    console.log('[ComandaBridge] tryPrint orderId=', orderId, 'tableLabel=', tableLabel);

    if (processedRef.current.has(orderId)) {
      console.log('[ComandaBridge] tryPrint skip — ya procesado en sesión:', orderId);
      return;
    }

    const won = await claimPrint(orderId);
    console.log('[ComandaBridge] claimPrint result — won=', won, 'orderId=', orderId);
    if (!won) return; // otro handheld lo tiene

    processedRef.current.add(orderId);

    const label = tableLabel ?? 'Mostrador';

    let printOk = false;
    try {
      await printKitchenTickets({ businessId, orderId, tableLabel: label, serverName: 'Cliente' });
      printOk = true;
      console.log('[ComandaBridge] impresión OK — orderId=', orderId);
    } catch (printErr) {
      console.warn('[ComandaBridge] fallo de impresión (1.º intento):', printErr);
    }

    if (printOk) {
      await markPrinted(orderId);
      return;
    }

    // Reintento único tras 30 s
    setTimeout(async () => {
      try {
        await printKitchenTickets({ businessId, orderId, tableLabel: label, serverName: 'Cliente' });
        await markPrinted(orderId);
        console.log('[ComandaBridge] impresión OK (2.º intento) — orderId=', orderId);
      } catch (retryErr) {
        console.warn('[ComandaBridge] fallo de impresión (2.º intento) — liberando reclamo:', retryErr);
        await releasePrint(orderId);
        // No hay UI de aviso — el siguiente handheld que abra el POS reintentará por catch-up.
      }
    }, RETRY_DELAY_MS);
  }

  // ── Catch-up: órdenes pendientes de los últimas 12 h ──────────────────────

  async function catchUp(): Promise<void> {
    try {
      const { data, error } = await (supabase as unknown as {
        rpc(fn: 'pos_pending_comandas', params: { p_business_id: string }):
          Promise<{ data: PendingComanda[] | null; error: { message: string } | null }>;
      }).rpc('pos_pending_comandas', { p_business_id: businessId });

      if (error) {
        console.warn('[ComandaBridge] catchUp error RPC:', error.message);
        return;
      }

      console.log('[ComandaBridge] catchUp:', data?.length ?? 0, 'pendientes');

      for (const row of data ?? []) {
        await tryPrint(row.order_id, row.table_label);
      }
    } catch (err) {
      console.error('[ComandaBridge] catchUp excepción inesperada:', err);
    }
  }

  // ── Realtime subscription ────────────────────────────────────────────────────

  function subscribe(): void {
    if (channelRef.current) {
      console.log('[ComandaBridge] subscribe skip — canal ya activo');
      return;
    }

    try {
      const channel = supabase
        .channel(`pos-comanda-bridge-${businessId}`)
        .on(
          'postgres_changes',
          {
            event:  'INSERT',
            schema: 'public',
            table:  'orders',
            filter: `business_id=eq.${businessId}`,
          },
          (payload: { new: Record<string, unknown> }) => {
            const row = payload.new;
            const src = row['source'] as string | undefined;
            const apr = row['approval_status'] as string | null | undefined;

            console.log(
              '[ComandaBridge] realtime INSERT recibido:',
              row['id'], 'source=', src, 'approval_status=', apr,
            );

            // Solo órdenes de cliente sin aprobación pendiente
            if (
              (src === 'customer_stripe' || src === 'customer_tab') &&
              (apr === null || apr === undefined || apr === 'approved')
            ) {
              const orderId    = row['id'] as string;
              const tableLabel = (row['table_label'] as string | null) ?? null;
              void tryPrint(orderId, tableLabel);
            }
          },
        )
        // F4: también escuchar UPDATE — imprime cuando el mesero aprueba una orden
        // que estaba en awaiting. El claim impide la doble impresión.
        .on(
          'postgres_changes',
          {
            event:  'UPDATE',
            schema: 'public',
            table:  'orders',
            filter: `business_id=eq.${businessId}`,
          },
          (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
            const newRow = payload.new;
            const oldRow = payload.old;
            const aprNew = newRow['approval_status'] as string | null | undefined;
            const aprOld = oldRow['approval_status'] as string | null | undefined;

            // Solo cuando transiciona awaiting → approved
            if (aprOld === 'awaiting' && aprNew === 'approved') {
              const orderId    = newRow['id'] as string;
              const tableLabel = (newRow['table_label'] as string | null) ?? null;
              console.log('[ComandaBridge] awaiting→approved, imprimiendo comanda:', orderId);
              void tryPrint(orderId, tableLabel);
            }
          },
        )
        .subscribe((status: string) => {
          console.log('[ComandaBridge] channel status:', status);
        });

      channelRef.current = channel;
    } catch (err) {
      console.error('[ComandaBridge] subscribe excepción inesperada:', err);
    }
  }

  function unsubscribe(): void {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }

  // ── AppState: catch-up al volver al primer plano ──────────────────────────

  useEffect(() => {
    const handler = (state: AppStateStatus): void => {
      if (state === 'active') {
        void catchUp();
      }
    };
    const sub = AppState.addEventListener('change', handler);
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  // ── Mount / unmount ──────────────────────────────────────────────────────────

  useEffect(() => {
    console.log('[ComandaBridge] mount, businessId=', businessId);

    try {
      subscribe();
      void catchUp(); // catch-up inicial al abrir el POS
    } catch (err) {
      console.error('[ComandaBridge] mount error:', err);
    }

    return () => {
      unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);
}
