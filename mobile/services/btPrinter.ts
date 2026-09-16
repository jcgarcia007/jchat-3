/**
 * Tab POS — Bluetooth printer service (F7, D-16/D-17/D-18)
 *
 * Classic/SPP Bluetooth (react-native-bluetooth-classic).
 * Printers stored locally in AsyncStorage — never in pos_printers.
 */

import { PermissionsAndroid, Platform } from 'react-native';
import RNBluetoothClassic, {
  type BluetoothDevice,
} from 'react-native-bluetooth-classic';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Typed errors ─────────────────────────────────────────────────────────────

export type BtErrorCode = 'BT_OFF' | 'NOT_PAIRED' | 'CONNECT_FAILED' | 'WRITE_FAILED';

export class BtPrinterError extends Error {
  constructor(public code: BtErrorCode, message: string) {
    super(message);
    this.name = 'BtPrinterError';
  }
}

// ─── Local printer record ─────────────────────────────────────────────────────

export interface BtPrinterRecord {
  id:       string;       // = address (stable)
  name:     string;       // BT announced name (e.g. "RPP02N")
  address:  string;
  widthMm:  58 | 80;
  alias?:   string;       // User-defined nickname (e.g. "M860 – 80mm")
  addedAt:  string;       // ISO-8601
}

// ─── AsyncStorage helpers ─────────────────────────────────────────────────────

const BT_PRINTERS_KEY = 'tabpos.btPrinters';

export async function loadBtPrinters(): Promise<BtPrinterRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(BT_PRINTERS_KEY);
    return raw ? (JSON.parse(raw) as BtPrinterRecord[]) : [];
  } catch {
    return [];
  }
}

export async function saveBtPrinters(list: BtPrinterRecord[]): Promise<void> {
  try {
    await AsyncStorage.setItem(BT_PRINTERS_KEY, JSON.stringify(list));
  } catch { /* best-effort */ }
}

export async function addBtPrinter(record: BtPrinterRecord): Promise<void> {
  const existing = await loadBtPrinters();
  // Replace if same address, otherwise append
  const filtered = existing.filter((p) => p.address !== record.address);
  await saveBtPrinters([...filtered, record]);
}

export async function removeBtPrinter(address: string): Promise<void> {
  const existing = await loadBtPrinters();
  await saveBtPrinters(existing.filter((p) => p.address !== address));
}

// ─── Permissions ──────────────────────────────────────────────────────────────

/**
 * Request BLUETOOTH_SCAN + BLUETOOTH_CONNECT on Android 12+ (API 31+).
 * Android ≤ 11 needs no runtime permissions for Classic BT.
 * iOS: Info.plist keys are handled at build time (NSBluetoothAlwaysUsageDescription).
 */
export async function requestBtPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if ((Platform.Version as number) < 31) return true;

  const granted = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
  ]);
  return (
    granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === 'granted' &&
    granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === 'granted'
  );
}

// ─── Device listing ───────────────────────────────────────────────────────────

/**
 * Return devices already paired in Android system Bluetooth settings.
 * Classic/SPP devices appear here after manual pairing.
 * Throws BtPrinterError('BT_OFF') if Bluetooth is disabled.
 */
export async function listPairedDevices(): Promise<
  { id: string; name: string; address: string }[]
> {
  const enabled = await RNBluetoothClassic.isBluetoothEnabled();
  if (!enabled) throw new BtPrinterError('BT_OFF', 'Bluetooth is disabled');

  const bonded = await RNBluetoothClassic.getBondedDevices();
  return bonded.map((d) => ({
    id:      d.address,
    name:    d.name ?? d.address,
    address: d.address,
  }));
}

// ─── Chunked write ────────────────────────────────────────────────────────────

const CHUNK_SIZE   = 512;  // SPP modules typically have a 512-byte MTU
const CHUNK_PAUSE  = 30;   // ms between chunks — avoids SPP buffer overflow
const DRAIN_WAIT   = 300;  // ms after last chunk — gives printer time to process

async function writeChunked(device: BluetoothDevice, data: Uint8Array): Promise<void> {
  for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
    const chunk = data.slice(offset, offset + CHUNK_SIZE);
    // react-native-bluetooth-classic.write() expects a string + encoding
    const str = Array.from(chunk).map((b) => String.fromCharCode(b)).join('');
    await device.write(str, 'latin1');
    if (offset + CHUNK_SIZE < data.length) {
      await new Promise((r) => setTimeout(r, CHUNK_PAUSE));
    }
  }
  // Let the printer drain before disconnect
  await new Promise((r) => setTimeout(r, DRAIN_WAIT));
}

// ─── Print ────────────────────────────────────────────────────────────────────

/**
 * Send ESC/POS bytes to a paired Bluetooth printer.
 *
 * Writes in ≤512-byte chunks with a 30 ms pause between each (prevents SPP
 * buffer overflow on budget thermal printers). 1 automatic retry on
 * CONNECT_FAILED. Throws BtPrinterError with a typed code on failure.
 *
 * Errors:
 *   BT_OFF         — Bluetooth adapter is off
 *   NOT_PAIRED     — device not in system bonded list
 *   CONNECT_FAILED — SPP connect failed after retry
 *   WRITE_FAILED   — connected but write threw
 */
export async function printToBluetooth(
  address: string,
  bytes: Uint8Array,
): Promise<void> {
  const enabled = await RNBluetoothClassic.isBluetoothEnabled();
  if (!enabled) throw new BtPrinterError('BT_OFF', 'Bluetooth is disabled');

  const bonded = await RNBluetoothClassic.getBondedDevices();
  if (!bonded.some((d) => d.address === address)) {
    throw new BtPrinterError('NOT_PAIRED', `Device ${address} is not paired`);
  }

  async function attempt(): Promise<void> {
    let device: BluetoothDevice | null = null;
    try {
      device = await RNBluetoothClassic.connectToDevice(address);
    } catch (e) {
      throw new BtPrinterError(
        'CONNECT_FAILED',
        e instanceof Error ? e.message : String(e),
      );
    }
    try {
      await writeChunked(device, bytes);
    } catch (e) {
      throw new BtPrinterError(
        'WRITE_FAILED',
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      try { await device?.disconnect(); } catch { /* ignore */ }
    }
  }

  try {
    await attempt();
  } catch (err) {
    if (err instanceof BtPrinterError && err.code === 'CONNECT_FAILED') {
      await new Promise((r) => setTimeout(r, 500));
      await attempt(); // 1 retry
    } else {
      throw err;
    }
  }
}
