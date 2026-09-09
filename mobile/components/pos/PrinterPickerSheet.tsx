/**
 * JChat 3.0 — PrinterPickerSheet (Tab POS · F2 · table session code)
 *
 * Resolves which staff printer to use and prints a Uint8Array ticket.
 *
 * Behaviour:
 *   • 0 printers → calls onNoPrinter (caller shows toast / error)
 *   • 1 printer  → prints directly, no UI shown
 *   • N printers → shows a Modal list; remembers the last selection in
 *                  AsyncStorage['tabpos.lastStaffPrinter'] (printer id)
 *
 * Usage:
 *   const ref = useRef<PrinterPickerSheetRef>(null);
 *   // …
 *   ref.current?.print(businessId, ticketBytes);
 *   // …
 *   <PrinterPickerSheet ref={ref} onNoPrinter={…} onError={…} />
 *
 * The component is fully self-contained: it fetches printers, handles
 * the last-used memory, and calls printToNetwork internally.
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

// ─── AsyncStorage key ─────────────────────────────────────────────────────────

const LAST_PRINTER_KEY = 'tabpos.lastStaffPrinter';

// ─── Public API ───────────────────────────────────────────────────────────────

export interface PrinterPickerSheetRef {
  /**
   * Resolve the printer (auto or via picker), then send `bytes`.
   * Calls `onNoPrinter` if no staff printer is configured.
   * Calls `onError` if the TCP send fails.
   */
  print: (businessId: string, bytes: Uint8Array) => Promise<void>;
}

interface PrinterPickerSheetProps {
  /** Called when no active staff printer exists for the business. */
  onNoPrinter?: () => void;
  /** Called when the TCP send fails. */
  onError?: (err: unknown) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

const PrinterPickerSheet = forwardRef<PrinterPickerSheetRef, PrinterPickerSheetProps>(
  function PrinterPickerSheet({ onNoPrinter, onError }, ref) {
    const { t }   = useTranslation('pos');
    const colors  = useThemeColors();

    // Picker state
    const [visible,  setVisible]  = useState(false);
    const [printers, setPrinters] = useState<NetworkPrinter[]>([]);
    const [loading,  setLoading]  = useState(false);

    // Pending job: bytes to print once the user picks a printer
    const pendingBytesRef = useRef<Uint8Array | null>(null);

    // ── Helpers ───────────────────────────────────────────────────────────────

    async function readLastPrinterId(): Promise<string | null> {
      try { return await AsyncStorage.getItem(LAST_PRINTER_KEY); }
      catch { return null; }
    }

    async function saveLastPrinterId(id: string): Promise<void> {
      try { await AsyncStorage.setItem(LAST_PRINTER_KEY, id); }
      catch { /* best-effort */ }
    }

    async function sendToPrinter(printer: NetworkPrinter, bytes: Uint8Array): Promise<void> {
      await saveLastPrinterId(printer.id);
      await printToNetwork(printer.host, printer.port, bytes);
    }

    // ── Imperative handle ─────────────────────────────────────────────────────

    const doPrint = useCallback(async (businessId: string, bytes: Uint8Array) => {
      setLoading(true);
      let list: NetworkPrinter[] = [];

      try {
        list = await fetchStaffPrinters(businessId);
      } finally {
        setLoading(false);
      }

      if (list.length === 0) {
        onNoPrinter?.();
        return;
      }

      if (list.length === 1) {
        try {
          await sendToPrinter(list[0], bytes);
        } catch (err) {
          onError?.(err);
        }
        return;
      }

      // Multiple printers — try last-used first; if still in the list, auto-send.
      const lastId = await readLastPrinterId();
      if (lastId) {
        const last = list.find((p) => p.id === lastId);
        if (last) {
          try {
            await sendToPrinter(last, bytes);
          } catch (err) {
            onError?.(err);
          }
          return;
        }
      }

      // Show picker
      pendingBytesRef.current = bytes;
      setPrinters(list);
      setVisible(true);
    }, [onNoPrinter, onError]);

    useImperativeHandle(ref, () => ({ print: doPrint }), [doPrint]);

    // ── Picker handlers ───────────────────────────────────────────────────────

    const handlePickPrinter = useCallback(async (printer: NetworkPrinter) => {
      setVisible(false);
      const bytes = pendingBytesRef.current;
      if (!bytes) return;
      pendingBytesRef.current = null;

      try {
        await sendToPrinter(printer, bytes);
      } catch (err) {
        onError?.(err);
      }
    }, [onError]);

    const handleCancel = useCallback(() => {
      setVisible(false);
      pendingBytesRef.current = null;
    }, []);

    // ── Render ────────────────────────────────────────────────────────────────

    const styles = makeStyles(colors);

    return (
      <>
        {/* Spinner overlay while fetching printers */}
        {loading && (
          <View style={styles.spinnerOverlay} pointerEvents="none">
            <ActivityIndicator color={colors.brand} />
          </View>
        )}

        <Modal
          visible={visible}
          transparent
          animationType="slide"
          onRequestClose={handleCancel}
        >
          <Pressable style={styles.backdrop} onPress={handleCancel} />

          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>
              {t('tableCode.pickPrinter')}
            </Text>

            <FlatList
              data={printers}
              keyExtractor={(p) => p.id}
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [
                    styles.printerRow,
                    pressed && styles.printerRowPressed,
                  ]}
                  onPress={() => handlePickPrinter(item)}
                >
                  <Text style={styles.printerLabel}>{item.label}</Text>
                  <Text style={styles.printerHost}>
                    {item.host}:{item.port}
                  </Text>
                </Pressable>
              )}
              ItemSeparatorComponent={() => <View style={styles.divider} />}
            />

            <Pressable style={styles.cancelBtn} onPress={handleCancel}>
              <Text style={styles.cancelText}>
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
      maxHeight: '60%',
    },
    sheetTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: colors.textPrimary,
      marginBottom: 12,
    },
    printerRow: {
      paddingVertical: 14,
      paddingHorizontal: 8,
    },
    printerRowPressed: {
      opacity: 0.6,
    },
    printerLabel: {
      fontSize: 16,
      color: colors.textPrimary,
      fontWeight: '500',
    },
    printerHost: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.borderSubtle,
    },
    cancelBtn: {
      marginTop: 16,
      paddingVertical: 14,
      alignItems: 'center',
      backgroundColor: colors.bgBase,
      borderRadius: 10,
    },
    cancelText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.danger,
    },
  });
}
