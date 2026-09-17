/**
 * JChat 3.0 — PrinterPickerSheet (Tab POS · F7)
 *
 * Unified selector for Bluetooth and network printers.
 *
 * Behaviour:
 *   • 0 printers → calls onNoPrinter
 *   • 1 printer  → prints directly, no UI
 *   • N printers → shows bottom-sheet list; remembers last choice per (businessId, ticketType)
 *
 * Ticket types: 'code' | 'receipt' | 'voucher'
 * Never routes to kitchen or bar printers.
 *
 * Usage:
 *   const ref = useRef<PrinterPickerSheetRef>(null);
 *   ref.current?.print(businessId, bytes, 'voucher');
 *   <PrinterPickerSheet ref={ref} onNoPrinter={…} onError={…} />
 */

import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../theme/colors';
import { fetchStaffPrinters, printToNetwork, type NetworkPrinter } from '../../services/printer';
import {
  loadBtPrinters,
  printToBluetooth,
  type BtPrinterRecord,
} from '../../services/btPrinter';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TicketType = 'code' | 'receipt' | 'voucher';

export type StaffPrinter =
  | ({ type: 'network' } & NetworkPrinter)
  | ({ type: 'bluetooth' } & BtPrinterRecord);

// ─── Combined printer list ────────────────────────────────────────────────────

/**
 * Returns all staff printers: saved Bluetooth printers (from this device) +
 * network printers with role receipt/waiter (from the business configuration).
 * Kitchen and bar printers are never included.
 */
export async function listStaffPrinters(businessId: string): Promise<StaffPrinter[]> {
  const [btPrinters, networkPrinters] = await Promise.all([
    loadBtPrinters().catch(() => [] as BtPrinterRecord[]),
    fetchStaffPrinters(businessId).catch(() => [] as NetworkPrinter[]),
  ]);
  return [
    ...btPrinters.map((p): StaffPrinter => ({ type: 'bluetooth', ...p })),
    ...networkPrinters.map((p): StaffPrinter => ({ type: 'network', ...p })),
  ];
}

// ─── Print dispatcher ─────────────────────────────────────────────────────────

async function printEscPos(printer: StaffPrinter, bytes: Uint8Array): Promise<void> {
  // Defensive guard — kitchen/bar printers must never reach staff printing paths.
  if (printer.type === 'network' && (printer.role === 'kitchen' || printer.role === 'bar')) {
    throw new Error('PRINTER_ROLE_FORBIDDEN');
  }
  if (printer.type === 'bluetooth') {
    await printToBluetooth(printer.address, bytes);
  } else {
    await printToNetwork(printer.host, printer.port, bytes);
  }
}

// ─── AsyncStorage key ─────────────────────────────────────────────────────────

function lastPrinterKey(businessId: string, ticketType: TicketType): string {
  return `tabpos.lastPrinter.${businessId}.${ticketType}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface PrinterPickerSheetRef {
  /**
   * Resolve the printer and send `bytes`.
   * @param businessId   The business whose network printers to fetch.
   * @param bytes        ESC/POS buffer to send.
   * @param ticketType   Scopes last-printer memory (default: 'code').
   */
  print: (businessId: string, bytes: Uint8Array, ticketType?: TicketType) => Promise<void>;
}

interface PrinterPickerSheetProps {
  onNoPrinter?: () => void;
  onError?: (err: unknown) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

const PrinterPickerSheet = forwardRef<PrinterPickerSheetRef, PrinterPickerSheetProps>(
  function PrinterPickerSheet({ onNoPrinter, onError }, ref) {
    const { t }  = useTranslation('settings');
    const colors = useThemeColors();

    const [visible,  setVisible]  = useState(false);
    const [printers, setPrinters] = useState<StaffPrinter[]>([]);
    const [loading,  setLoading]  = useState(false);

    const pendingBytesRef      = useRef<Uint8Array | null>(null);
    const pendingBusinessIdRef = useRef<string>('');
    const pendingTicketTypeRef = useRef<TicketType>('code');

    // ── Helpers ───────────────────────────────────────────────────────────────

    async function readLastPrinterId(businessId: string, ticketType: TicketType): Promise<string | null> {
      try { return await AsyncStorage.getItem(lastPrinterKey(businessId, ticketType)); }
      catch { return null; }
    }

    async function saveLastPrinterId(businessId: string, ticketType: TicketType, id: string): Promise<void> {
      try { await AsyncStorage.setItem(lastPrinterKey(businessId, ticketType), id); }
      catch { /* best-effort */ }
    }

    async function sendToPrinter(
      printer: StaffPrinter,
      bytes: Uint8Array,
      businessId: string,
      ticketType: TicketType,
    ): Promise<void> {
      await saveLastPrinterId(businessId, ticketType, printer.id);
      await printEscPos(printer, bytes);
    }

    // ── Imperative handle ─────────────────────────────────────────────────────

    const doPrint = useCallback(async (
      businessId: string,
      bytes: Uint8Array,
      ticketType: TicketType = 'code',
    ) => {
      setLoading(true);
      let list: StaffPrinter[] = [];
      try {
        list = await listStaffPrinters(businessId);
      } finally {
        setLoading(false);
      }

      if (list.length === 0) {
        onNoPrinter?.();
        return;
      }

      if (list.length === 1) {
        try { await sendToPrinter(list[0], bytes, businessId, ticketType); }
        catch (err) { onError?.(err); }
        return;
      }

      // Multiple printers — try last-used first; if still in list, auto-send.
      const lastId = await readLastPrinterId(businessId, ticketType);
      if (lastId) {
        const last = list.find((p) => p.id === lastId);
        if (last) {
          try { await sendToPrinter(last, bytes, businessId, ticketType); }
          catch (err) { onError?.(err); }
          return;
        }
      }

      // Show picker
      pendingBytesRef.current      = bytes;
      pendingBusinessIdRef.current = businessId;
      pendingTicketTypeRef.current = ticketType;
      setPrinters(list);
      setVisible(true);
    }, [onNoPrinter, onError]);

    useImperativeHandle(ref, () => ({ print: doPrint }), [doPrint]);

    // ── Picker handlers ───────────────────────────────────────────────────────

    const handlePickPrinter = useCallback(async (printer: StaffPrinter) => {
      setVisible(false);
      const bytes      = pendingBytesRef.current;
      const businessId = pendingBusinessIdRef.current;
      const ticketType = pendingTicketTypeRef.current;
      pendingBytesRef.current = null;
      if (!bytes) return;
      try { await sendToPrinter(printer, bytes, businessId, ticketType); }
      catch (err) { onError?.(err); }
    }, [onError]);

    const handleCancel = useCallback(() => {
      setVisible(false);
      pendingBytesRef.current = null;
    }, []);

    // ── Render ────────────────────────────────────────────────────────────────

    const s = makeStyles(colors);

    const renderItem = useCallback(({ item }: { item: StaffPrinter }) => {
      const isBt      = item.type === 'bluetooth';
      const nameLabel = isBt ? (item.alias ?? item.name) : item.label;
      const subLabel  = isBt
        ? `Bluetooth · ${item.widthMm} mm`
        : `${item.host}:${item.port}`;
      return (
        <Pressable
          style={({ pressed }) => [s.printerRow, pressed && s.printerRowPressed]}
          onPress={() => handlePickPrinter(item)}
        >
          <View style={s.printerRowLeft}>
            <View style={[s.chip, isBt ? s.chipBt : s.chipNet]}>
              <Text style={s.chipText}>{isBt ? 'BT' : 'Red'}</Text>
            </View>
          </View>
          <View style={s.printerRowRight}>
            <Text style={[s.printerLabel, { color: colors.textPrimary }]}>{nameLabel}</Text>
            <Text style={[s.printerHost, { color: colors.textSecondary }]}>{subLabel}</Text>
          </View>
        </Pressable>
      );
    }, [handlePickPrinter, colors, s]);

    return (
      <>
        {loading && (
          <View style={s.spinnerOverlay} pointerEvents="none">
            <ActivityIndicator color={colors.brand} />
          </View>
        )}

        <Modal
          visible={visible}
          transparent
          animationType="slide"
          onRequestClose={handleCancel}
        >
          <Pressable style={s.backdrop} onPress={handleCancel} />
          <View style={s.sheet}>
            <Text style={[s.sheetTitle, { color: colors.textPrimary }]}>
              {t('pos.tableCode.pickPrinter')}
            </Text>
            <FlatList
              data={printers}
              keyExtractor={(p) => p.id}
              renderItem={renderItem}
              ItemSeparatorComponent={() => <View style={s.divider} />}
            />
            <Pressable style={[s.cancelBtn, { backgroundColor: colors.bgBase }]} onPress={handleCancel}>
              <Text style={[s.cancelText, { color: colors.danger }]}>
                {t('common.cancel', { defaultValue: 'Cancelar' })}
              </Text>
            </Pressable>
          </View>
        </Modal>
      </>
    );
  },
);

export default PrinterPickerSheet;

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(colors: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    spinnerOverlay: {
      ...StyleSheet.absoluteFill,
      justifyContent: 'center',
      alignItems: 'center',
    },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    sheet: {
      backgroundColor: colors.bgSurface,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingTop: 20,
      paddingBottom: 32,
      paddingHorizontal: 16,
      maxHeight: '65%',
    },
    sheetTitle: {
      fontSize: 17,
      fontWeight: '600',
      marginBottom: 12,
    },
    printerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 8,
    },
    printerRowPressed: { opacity: 0.6 },
    printerRowLeft: { marginRight: 10 },
    printerRowRight: { flex: 1 },
    chip: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    chipBt:   { backgroundColor: '#7C3AED22' },
    chipNet:  { backgroundColor: '#1D9E7522' },
    chipText: { fontSize: 10, fontWeight: '700' },
    printerLabel: {
      fontSize: 15,
      fontWeight: '500',
    },
    printerHost: {
      fontSize: 12,
      marginTop: 1,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.borderSubtle,
    },
    cancelBtn: {
      marginTop: 16,
      paddingVertical: 14,
      alignItems: 'center',
      borderRadius: 10,
    },
    cancelText: {
      fontSize: 16,
      fontWeight: '600',
    },
  });
}
