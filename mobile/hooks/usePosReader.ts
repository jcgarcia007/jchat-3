/**
 * JChat 3.0 — usePosReader
 *
 * Shared hook that encapsulates the full Stripe Terminal M2 reader lifecycle:
 *   1. Fetch a Terminal Location id from the server (required by Bluetooth connect).
 *   2. Discover readers via real Bluetooth scan (simulated: false).
 *   3. Auto-connect the first discovered reader using the server locationId.
 *   4. Handle firmware update callbacks + progress for the M2 first-connect flow.
 *   5. Disconnect the reader when the screen unmounts.
 *   6. Provide a retry handler that re-runs the full startup sequence.
 *
 * Both PosCheckoutScreen and PosSplitScreen use this hook so reader logic
 * stays in one place and cannot silently diverge (e.g. simulated: true creep).
 *
 * Usage:
 *   const {
 *     readerStatus, readerError, updateProgress,
 *     connectedReader,
 *     retrievePaymentIntent, collectPaymentMethod, confirmPaymentIntent,
 *     handleRetryReader,
 *   } = usePosReader({ businessId });
 *
 * Rules of Hooks: call unconditionally. Check `isTerminalAvailable` in the
 * screen to render a fallback — the stub never crashes.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStripeTerminal } from '../services/terminalSdk';
import { getOrCreateTerminalLocation } from '../services/terminal';

// ─── Types ─────────────────────────────────────────────────────────────────────

/**
 * Granular reader lifecycle states.
 *
 * locating    — fetching Terminal Location id from server (async EF call)
 * discovering — BT scan running, no reader spotted yet
 * connecting  — first reader found; connectReader() in progress
 * updating    — required/optional firmware update being installed during connect
 * ready       — reader connected and ready to collect payments
 * error       — last operation failed; employee can tap Retry
 */
export type ReaderStatus =
  | 'locating'
  | 'discovering'
  | 'connecting'
  | 'updating'
  | 'ready'
  | 'error';

export interface UsePosReaderOptions {
  /** Business whose Stripe Terminal Location will be fetched/created. */
  businessId: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface UsePosReaderReturn {
  /** Current reader lifecycle state — use for banner UI. */
  readerStatus: ReaderStatus;
  /** Human-readable error message; non-null only when status === 'error'. */
  readerError: string | null;
  /**
   * Firmware update progress 0–100, null when no update is running.
   * Show a ProgressBar when status === 'updating'.
   */
  updateProgress: number | null;

  // ── SDK passthrough ────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connectedReader: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  retrievePaymentIntent: (clientSecret: string) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  collectPaymentMethod: (pi: any) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  confirmPaymentIntent: (pi: any) => Promise<any>;

  /**
   * Tap "Reintentar" to restart the reader connection.
   * If locationId is already cached, jumps straight to the BT scan.
   * Otherwise re-fetches the location from the server first.
   */
  handleRetryReader: () => void;
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function usePosReader({ businessId }: UsePosReaderOptions): UsePosReaderReturn {
  const { t } = useTranslation('settings');

  // ── Reader state ─────────────────────────────────────────────────────────────
  const [readerStatus, setReaderStatus] = useState<ReaderStatus>('locating');
  const [readerError, setReaderError] = useState<string | null>(null);
  // Firmware update progress — 0–100, null when no update in progress.
  const [updateProgress, setUpdateProgress] = useState<number | null>(null);
  // Guard against double-connect race when discoveredReaders fires multiple times.
  const isConnectingRef = useRef(false);
  // Terminal Location id fetched from server (required by ConnectBluetoothReaderParams).
  const locationIdRef = useRef<string | null>(null);

  // ── Stripe Terminal SDK ───────────────────────────────────────────────────────
  const {
    discoverReaders,
    cancelDiscovering,
    connectReader,
    retrievePaymentIntent,
    collectPaymentMethod,
    confirmPaymentIntent,
    disconnectReader,
    discoveredReaders,
    connectedReader,
  } = useStripeTerminal({
    // ── Reader software update callbacks ────────────────────────────────────
    // Required updates are installed automatically during connectReader.
    // Optional updates are also auto-installed here for a seamless employee UX.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onDidStartInstallingUpdate: (_update: any) => {
      setReaderStatus('updating');
      setUpdateProgress(0);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onDidReportReaderSoftwareUpdateProgress: (progress: any) => {
      // progress is a string "0.0"–"1.0" representing fraction complete.
      const fraction = typeof progress === 'string' ? parseFloat(progress) : NaN;
      setUpdateProgress(isFinite(fraction) ? Math.round(fraction * 100) : null);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onDidFinishInstallingUpdate: (result: any) => {
      setUpdateProgress(null);
      if (result?.error) {
        // Update failed — reader is disconnected; show error and allow retry.
        setReaderStatus('error');
        setReaderError(
          (result.error as { message?: string })?.message ?? t('pos.readerError'),
        );
        isConnectingRef.current = false;
      }
      // On success: connectReader is waiting for the update and will resolve
      // normally — readerStatus will be set to 'ready' in the connect .then().
    },
  });

  // ── Start reader discovery on mount ──────────────────────────────────────────
  // Step 1: fetch a Terminal Location from the server (needed for connect).
  // Step 2: start a real Bluetooth scan (simulated: false).
  useEffect(() => {
    let cancelled = false;

    async function startDiscovery() {
      // ── Phase 1: get Terminal Location id (required by Bluetooth connect) ──
      setReaderStatus('locating');
      setReaderError(null);
      setUpdateProgress(null);

      const locResult = await getOrCreateTerminalLocation(businessId);
      if (cancelled) return;

      if (!locResult.ok) {
        setReaderStatus('error');
        setReaderError(locResult.message ?? t('pos.readerError'));
        return;
      }
      locationIdRef.current = locResult.locationId;

      // ── Phase 2: start Bluetooth scan (real reader, not simulated) ─────────
      setReaderStatus('discovering');
      const res = await discoverReaders({ discoveryMethod: 'bluetoothScan', simulated: false });
      if (cancelled) return;

      // discoverReaders resolves when scanning ends (cancelled or error).
      // If it ended with an error AND we're not already connecting/connected,
      // surface it as a reader error.
      if (res?.error) {
        setReaderStatus((prev) =>
          prev === 'connecting' || prev === 'updating' || prev === 'ready' ? prev : 'error',
        );
        setReaderError(res.error.message ?? t('pos.readerError'));
      }
    }

    startDiscovery();

    return () => {
      cancelled = true;
      cancelDiscovering();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — runs only on mount

  // ── Auto-connect when first reader appears ────────────────────────────────────
  // locationIdRef.current is set by the discovery effect before scan starts.
  // If the M2 has a required firmware update, connectReader waits for it to
  // complete before resolving (callbacks set status to 'updating' + progress).
  useEffect(() => {
    if (
      discoveredReaders.length === 0 ||
      connectedReader ||
      isConnectingRef.current ||
      readerStatus === 'ready' ||
      readerStatus === 'updating' ||
      !locationIdRef.current // wait until location is fetched from server
    ) {
      return;
    }

    isConnectingRef.current = true;
    setReaderStatus('connecting');
    const reader = discoveredReaders[0];
    const locationId = locationIdRef.current; // stable: set once before scan

    cancelDiscovering()
      .then(() =>
        connectReader({
          discoveryMethod: 'bluetoothScan',
          reader,
          locationId,
          // Automatically reconnect if the reader drops mid-session
          // (e.g. BT interference, reader sleep). The SDK handles the retry.
          autoReconnectOnUnexpectedDisconnect: true,
        }),
      )
      .then((result: { error?: { message: string } | null }) => {
        if (result.error) {
          setReaderStatus('error');
          setReaderError(result.error.message ?? t('pos.readerError'));
          isConnectingRef.current = false;
        } else {
          // connectReader resolved without error → reader is ready (update, if
          // any, has already completed and status may already be 'updating' →
          // overwrite with 'ready' now that connect has fully resolved).
          setReaderStatus('ready');
          setUpdateProgress(null);
          // isConnectingRef.current stays true (we're connected)
        }
      })
      .catch((err: unknown) => {
        setReaderStatus('error');
        setReaderError(err instanceof Error ? err.message : t('pos.readerError'));
        isConnectingRef.current = false;
      });
  }, [discoveredReaders, connectedReader, readerStatus, cancelDiscovering, connectReader, t]);

  // ── Disconnect reader when the host screen unmounts ───────────────────────────
  useEffect(() => {
    return () => {
      disconnectReader().catch(() => {});
    };
  }, [disconnectReader]);

  // ── Retry reader connection ───────────────────────────────────────────────────
  const handleRetryReader = useCallback(() => {
    isConnectingRef.current = false;
    setReaderError(null);
    setUpdateProgress(null);

    if (locationIdRef.current) {
      // Location already resolved — skip the EF call and go straight to scan.
      setReaderStatus('discovering');
      discoverReaders({ discoveryMethod: 'bluetoothScan', simulated: false });
    } else {
      // Location fetch failed on mount — retry the full startup sequence.
      setReaderStatus('locating');
      getOrCreateTerminalLocation(businessId).then((locResult) => {
        if (!locResult.ok) {
          setReaderStatus('error');
          setReaderError(locResult.message ?? t('pos.readerError'));
          return;
        }
        locationIdRef.current = locResult.locationId;
        setReaderStatus('discovering');
        discoverReaders({ discoveryMethod: 'bluetoothScan', simulated: false });
      });
    }
  }, [businessId, discoverReaders, t]);

  // ── Return ────────────────────────────────────────────────────────────────────
  return {
    readerStatus,
    readerError,
    updateProgress,
    connectedReader,
    retrievePaymentIntent,
    collectPaymentMethod,
    confirmPaymentIntent,
    handleRetryReader,
  };
}
