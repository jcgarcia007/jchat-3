/**
 * BtPrinterSmokeTest — Tab POS · F7 smoke test
 *
 * Purpose: validate that react-native-bluetooth-classic loads and runs under
 * the New Architecture (newArchEnabled=true) in Expo SDK 56 / RN 0.85.
 *
 * What it does:
 *   1. Checks Bluetooth is enabled.
 *   2. Requests BLUETOOTH_SCAN + BLUETOOTH_CONNECT on Android 12+.
 *   3. Lists bonded (already-paired) devices.
 *   4. On tap: connects via SPP, sends a minimal ESC/POS test ticket, disconnects.
 *
 * This screen is TEMPORARY — removed in the final F7 delivery once "Mis
 * impresoras" is implemented. It is navigation-accessible only from
 * PosHomeScreen via a hidden "BT Test" button during the smoke-test phase.
 *
 * NEVER ships to production — guarded by __DEV__ check.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import RNBluetoothClassic, {
  BluetoothDevice,
} from 'react-native-bluetooth-classic';
import { useThemeColors } from '../../theme/colors';

// ─── ESC/POS test ticket (inline — no escpos.ts dependency for the smoke test)

const PC437_ENCODE = (str: string): number[] =>
  Array.from(str).map((c) => c.charCodeAt(0) & 0xff);

function buildSmokeTicket(deviceName: string, widthMm: number): Uint8Array {
  const cols = widthMm >= 80 ? 48 : 32;
  const line = '-'.repeat(cols);
  const center = (s: string) => {
    const pad = Math.max(0, Math.floor((cols - s.length) / 2));
    return ' '.repeat(pad) + s;
  };

  const ESC = 0x1b;
  const GS  = 0x1d;
  const LF  = 0x0a;

  const chunks: number[] = [
    // Reset
    ESC, 0x40,
    // Center
    ESC, 0x61, 0x01,
    // Bold ON
    ESC, 0x45, 0x01,
    ...PC437_ENCODE('PRUEBA OK'), LF,
    // Bold OFF
    ESC, 0x45, 0x00,
    ...PC437_ENCODE('Tab POS — F7 Bluetooth'), LF,
    ...PC437_ENCODE(center(line)), LF,
    // Left align
    ESC, 0x61, 0x00,
    ...PC437_ENCODE(`Printer: ${deviceName}`), LF,
    ...PC437_ENCODE(`Ancho:   ${widthMm} mm (${cols} cols)`), LF,
    ...PC437_ENCODE('Arch:    New Architecture'), LF,
    ...PC437_ENCODE(center(line)), LF,
    // Double-size check
    ESC, 0x61, 0x01,
    GS, 0x21, 0x11,
    ...PC437_ENCODE('IMPRIME!'), LF,
    GS, 0x21, 0x00,
    ESC, 0x61, 0x00,
    ...PC437_ENCODE(new Date().toLocaleString('es-MX')), LF,
    // Feed + cut
    0x0a, 0x0a, 0x0a, 0x0a,
    GS, 0x56, 0x00,
  ];

  return new Uint8Array(chunks);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function requestBtPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true; // iOS: handled by Info.plist
  if (Platform.Version < 31) return true;      // Android ≤ 11: no runtime BT perms needed
  const granted = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
  ]);
  return (
    granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === 'granted' &&
    granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === 'granted'
  );
}

/** Send bytes in ≤512-byte chunks with a small pause to avoid SPP buffer overflow. */
async function writeChunked(device: BluetoothDevice, data: Uint8Array): Promise<void> {
  const CHUNK = 512;
  const PAUSE = 30; // ms between chunks
  for (let offset = 0; offset < data.length; offset += CHUNK) {
    const chunk = data.slice(offset, offset + CHUNK);
    // react-native-bluetooth-classic write() accepts a string; encode as Latin-1
    const str = Array.from(chunk).map((b) => String.fromCharCode(b)).join('');
    await device.write(str, 'latin1');
    if (offset + CHUNK < data.length) {
      await new Promise((r) => setTimeout(r, PAUSE));
    }
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface DeviceRow {
  device: BluetoothDevice;
  status: 'idle' | 'connecting' | 'printing' | 'ok' | 'error';
  errorMsg?: string;
}

export default function BtPrinterSmokeTest() {
  const colors = useThemeColors();
  const [btEnabled, setBtEnabled]   = useState<boolean | null>(null);
  const [loading, setLoading]       = useState(true);
  const [devices, setDevices]       = useState<DeviceRow[]>([]);
  const [widthMm, setWidthMm]       = useState<58 | 80>(80);

  // Load bonded devices on mount
  useEffect(() => {
    (async () => {
      try {
        const hasPerms = await requestBtPermissions();
        if (!hasPerms) {
          Alert.alert('Permisos Bluetooth', 'Se necesitan permisos de Bluetooth para continuar.');
          setLoading(false);
          return;
        }
        const enabled = await RNBluetoothClassic.isBluetoothEnabled();
        setBtEnabled(enabled);
        if (!enabled) { setLoading(false); return; }
        const paired = await RNBluetoothClassic.getBondedDevices();
        setDevices(paired.map((d) => ({ device: d, status: 'idle' })));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        Alert.alert('Error BT', `react-native-bluetooth-classic falló:\n${msg}`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const testPrint = useCallback(async (index: number) => {
    const row = devices[index];
    if (!row || row.status === 'connecting' || row.status === 'printing') return;

    const update = (patch: Partial<DeviceRow>) =>
      setDevices((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));

    let device: BluetoothDevice | null = null;
    try {
      update({ status: 'connecting', errorMsg: undefined });
      device = await RNBluetoothClassic.connectToDevice(row.device.address);

      update({ status: 'printing' });
      const ticket = buildSmokeTicket(row.device.name ?? row.device.address, widthMm);
      await writeChunked(device, ticket);
      // Wait for printer to process before disconnect
      await new Promise((r) => setTimeout(r, 400));
      update({ status: 'ok' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      update({ status: 'error', errorMsg: msg });
    } finally {
      try { await device?.disconnect(); } catch { /* ignore */ }
    }
  }, [devices, widthMm]);

  const s = styles(colors);

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.brand} />
        <Text style={s.subtitle}>Cargando módulo Bluetooth…</Text>
      </View>
    );
  }

  if (btEnabled === false) {
    return (
      <View style={s.center}>
        <Text style={s.title}>🔵 Bluetooth apagado</Text>
        <Text style={s.subtitle}>Activa Bluetooth en el dispositivo y vuelve a abrir esta pantalla.</Text>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <Text style={s.title}>🖨 BT Smoke Test — F7</Text>
      <Text style={s.subtitle}>
        Módulo: react-native-bluetooth-classic{'\n'}
        Arch: {(globalThis as Record<string, unknown>).__turboModuleProxy ? 'New (Turbo)' : 'Interop/Old'}
      </Text>

      {/* Width selector */}
      <View style={s.row}>
        <Text style={s.label}>Ancho del ticket:</Text>
        {([58, 80] as const).map((w) => (
          <Pressable
            key={w}
            onPress={() => setWidthMm(w)}
            style={[s.chip, widthMm === w && s.chipActive]}
          >
            <Text style={[s.chipText, widthMm === w && s.chipTextActive]}>{w} mm</Text>
          </Pressable>
        ))}
      </View>

      {devices.length === 0 ? (
        <Text style={s.empty}>
          No hay impresoras emparejadas.{'\n'}
          Empareja el M860 o NT-1809 en Ajustes → Bluetooth del dispositivo y vuelve.
        </Text>
      ) : (
        <FlatList
          data={devices}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item, index }) => (
            <Pressable
              style={[s.deviceCard, item.status === 'ok' && s.deviceOk, item.status === 'error' && s.deviceErr]}
              onPress={() => testPrint(index)}
              disabled={item.status === 'connecting' || item.status === 'printing'}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.deviceName}>{item.device.name ?? '(sin nombre)'}</Text>
                <Text style={s.deviceAddr}>{item.device.address}</Text>
                {item.errorMsg ? <Text style={s.errMsg}>{item.errorMsg}</Text> : null}
              </View>
              {(item.status === 'connecting' || item.status === 'printing') ? (
                <ActivityIndicator color={colors.brand} />
              ) : (
                <Text style={s.action}>
                  {item.status === 'ok' ? '✅ OK' : item.status === 'error' ? '❌ Error' : '▶ Imprimir prueba'}
                </Text>
              )}
            </Pressable>
          )}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    root:           { flex: 1, backgroundColor: colors.bgBase, padding: 16 },
    center:         { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.bgBase },
    title:          { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
    subtitle:       { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginBottom: 16 },
    row:            { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
    label:          { fontSize: 14, color: colors.textPrimary, marginRight: 4 },
    chip:           { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.bgSurface, borderWidth: 1, borderColor: colors.borderSubtle },
    chipActive:     { backgroundColor: colors.brand, borderColor: colors.brand },
    chipText:       { fontSize: 13, color: colors.textPrimary },
    chipTextActive: { color: '#fff', fontWeight: '700' },
    empty:          { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 32, lineHeight: 22 },
    deviceCard:     { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgSurface, borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.borderSubtle },
    deviceOk:       { borderColor: '#1D9E75' },
    deviceErr:      { borderColor: '#ef4444' },
    deviceName:     { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
    deviceAddr:     { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    errMsg:         { fontSize: 11, color: '#ef4444', marginTop: 4 },
    action:         { fontSize: 13, color: colors.brand, fontWeight: '600', marginLeft: 8 },
  });
