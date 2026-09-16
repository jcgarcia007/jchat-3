/**
 * JChat 3.0 — Mis impresoras (Tab POS · F7 · Paso 8)
 *
 * Lets the waiter manage Bluetooth printers saved on this device.
 *
 * Sections:
 *   1. Saved BT printers — name, address, width, "Probar", "Quitar"
 *   2. Network printers  — read-only, note "Se configuran en el dashboard"
 *   3. Add button        — lists paired system BT devices → choose → pick width →
 *                          print test → save
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import {
  IconBluetoothConnected,
  IconChevronLeft,
  IconPlus,
  IconPrinter,
  IconTrash,
  IconWifi,
} from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import {
  addBtPrinter,
  listPairedDevices,
  loadBtPrinters,
  printToBluetooth,
  removeBtPrinter,
  requestBtPermissions,
  type BtPrinterRecord,
} from '../../services/btPrinter';
import { buildTableCodeTicketEscPos } from '../../services/escpos';
import { fetchStaffPrinters, type NetworkPrinter } from '../../services/printer';
import type { PosStackParamList } from '../../navigation/PosNavigator';

type PosMyPrintersRoute = RouteProp<PosStackParamList, 'PosMyPrinters'>;

// ─── Component ────────────────────────────────────────────────────────────────

export default function PosMyPrintersScreen(): React.ReactElement {
  const { t }    = useTranslation('settings');
  const colors   = useThemeColors();
  const insets   = useSafeAreaInsets();
  const nav      = useNavigation();
  const { params } = useRoute<PosMyPrintersRoute>();
  const { businessId, businessName } = params;

  const [btPrinters,  setBtPrinters]  = useState<BtPrinterRecord[]>([]);
  const [netPrinters, setNetPrinters] = useState<NetworkPrinter[]>([]);
  const [loading,     setLoading]     = useState(true);

  // ── Add flow state ────────────────────────────────────────────────────────
  const [addPhase, setAddPhase] = useState<'idle' | 'listing' | 'picking' | 'width' | 'testing'>('idle');
  const [pairedDevices, setPairedDevices] = useState<{ id: string; name: string; address: string }[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<{ id: string; name: string; address: string } | null>(null);
  const [selectedWidth, setSelectedWidth] = useState<58 | 80>(80);
  const [testState, setTestState] = useState<'idle' | 'printing' | 'ok' | 'error'>('idle');
  const [testError, setTestError] = useState<string | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function load() {
        setLoading(true);
        const [bt, net] = await Promise.all([
          loadBtPrinters().catch(() => [] as BtPrinterRecord[]),
          fetchStaffPrinters(businessId).catch(() => [] as NetworkPrinter[]),
        ]);
        if (!cancelled) {
          setBtPrinters(bt);
          setNetPrinters(net);
          setLoading(false);
        }
      }
      load();
      return () => { cancelled = true; };
    }, [businessId]),
  );

  // ── Helpers ───────────────────────────────────────────────────────────────

  async function handleRemove(address: string) {
    await removeBtPrinter(address);
    setBtPrinters((prev) => prev.filter((p) => p.address !== address));
  }

  async function handleTestPrint(record: BtPrinterRecord) {
    const bytes = buildTableCodeTicketEscPos({
      businessName,
      tableLabel: 'Prueba',
      accessCode: '000000',
      serverName: null,
      widthMm: record.widthMm,
    });
    try {
      await printToBluetooth(record.address, bytes);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : String(err));
    }
  }

  // ── Add flow ──────────────────────────────────────────────────────────────

  async function handleStartAdd() {
    setAddPhase('listing');
    const hasPerms = await requestBtPermissions();
    if (!hasPerms) {
      Alert.alert(
        t('pos.printers.btPermTitle'),
        t('pos.printers.btPermBody'),
        [{ text: t('pos.printers.openSettings'), onPress: () => Linking.openSettings() }, { text: 'OK' }],
      );
      setAddPhase('idle');
      return;
    }
    try {
      const devices = await listPairedDevices();
      if (devices.length === 0) {
        Alert.alert(t('pos.printers.noPairedTitle'), t('pos.printers.noPairedBody'));
        setAddPhase('idle');
        return;
      }
      setPairedDevices(devices);
      setAddPhase('picking');
    } catch (err) {
      Alert.alert('Error Bluetooth', err instanceof Error ? err.message : String(err));
      setAddPhase('idle');
    }
  }

  function handlePickDevice(device: { id: string; name: string; address: string }) {
    setSelectedDevice(device);
    setSelectedWidth(80);
    setAddPhase('width');
  }

  async function handleConfirmWidth() {
    if (!selectedDevice) return;
    setAddPhase('testing');
    setTestState('printing');
    setTestError(null);

    const bytes = buildTableCodeTicketEscPos({
      businessName,
      tableLabel: 'Prueba',
      accessCode: '000000',
      serverName: null,
      widthMm: selectedWidth,
    });

    try {
      await printToBluetooth(selectedDevice.address, bytes);
      setTestState('ok');
    } catch (err) {
      setTestState('error');
      setTestError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleSave() {
    if (!selectedDevice) return;
    const record: BtPrinterRecord = {
      id:       selectedDevice.address,
      name:     selectedDevice.name,
      address:  selectedDevice.address,
      widthMm:  selectedWidth,
      addedAt:  new Date().toISOString(),
    };
    await addBtPrinter(record);
    setBtPrinters((prev) => {
      const filtered = prev.filter((p) => p.address !== record.address);
      return [...filtered, record];
    });
    resetAddFlow();
  }

  function resetAddFlow() {
    setAddPhase('idle');
    setSelectedDevice(null);
    setTestState('idle');
    setTestError(null);
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  const s = makeStyles(colors);

  function renderAddFlow() {
    if (addPhase === 'idle') return null;

    if (addPhase === 'listing') {
      return (
        <View style={[s.addCard, { backgroundColor: colors.bgSurface }]}>
          <ActivityIndicator color={colors.brand} />
          <Text style={[s.addPhaseLabel, { color: colors.textSecondary }]}>
            {t('pos.printers.loadingPaired')}
          </Text>
        </View>
      );
    }

    if (addPhase === 'picking') {
      return (
        <View style={[s.addCard, { backgroundColor: colors.bgSurface }]}>
          <Text style={[s.addCardTitle, { color: colors.textPrimary }]}>
            {t('pos.printers.selectDevice')}
          </Text>
          {pairedDevices.map((d) => (
            <Pressable
              key={d.address}
              style={({ pressed }) => [s.deviceRow, pressed && { opacity: 0.7 }]}
              onPress={() => handlePickDevice(d)}
            >
              <IconBluetoothConnected size={18} color={colors.brand} strokeWidth={1.8} />
              <View style={{ marginLeft: 10 }}>
                <Text style={[s.deviceName, { color: colors.textPrimary }]}>{d.name}</Text>
                <Text style={[s.deviceAddr, { color: colors.textSecondary }]}>{d.address}</Text>
              </View>
            </Pressable>
          ))}
          <Pressable onPress={resetAddFlow} style={s.cancelRow}>
            <Text style={[s.cancelText, { color: colors.danger }]}>
              {t('common.cancel', { defaultValue: 'Cancelar' })}
            </Text>
          </Pressable>
        </View>
      );
    }

    if (addPhase === 'width') {
      return (
        <View style={[s.addCard, { backgroundColor: colors.bgSurface }]}>
          <Text style={[s.addCardTitle, { color: colors.textPrimary }]}>
            {selectedDevice?.name}
          </Text>
          <Text style={[s.addPhaseLabel, { color: colors.textSecondary }]}>
            {t('pos.printers.selectWidth')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
            {([58, 80] as const).map((w) => (
              <Pressable
                key={w}
                style={[s.widthChip, selectedWidth === w && { backgroundColor: colors.brand }]}
                onPress={() => setSelectedWidth(w)}
              >
                <Text style={[s.widthChipText, selectedWidth === w && { color: '#fff' }]}>
                  {w} mm
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            style={[s.primaryBtn, { backgroundColor: colors.brand, marginTop: 16 }]}
            onPress={handleConfirmWidth}
          >
            <Text style={s.primaryBtnText}>{t('pos.printers.printTest')}</Text>
          </Pressable>
          <Pressable onPress={resetAddFlow} style={s.cancelRow}>
            <Text style={[s.cancelText, { color: colors.danger }]}>
              {t('common.cancel', { defaultValue: 'Cancelar' })}
            </Text>
          </Pressable>
        </View>
      );
    }

    if (addPhase === 'testing') {
      return (
        <View style={[s.addCard, { backgroundColor: colors.bgSurface }]}>
          <Text style={[s.addCardTitle, { color: colors.textPrimary }]}>
            {selectedDevice?.name}
          </Text>
          {testState === 'printing' ? (
            <>
              <ActivityIndicator color={colors.brand} />
              <Text style={[s.addPhaseLabel, { color: colors.textSecondary }]}>
                {t('pos.printers.testPrinting')}
              </Text>
            </>
          ) : testState === 'ok' ? (
            <>
              <Text style={[s.addPhaseLabel, { color: colors.success }]}>
                ✓ {t('pos.printers.testOk')}
              </Text>
              <Pressable
                style={[s.primaryBtn, { backgroundColor: colors.brand, marginTop: 12 }]}
                onPress={handleSave}
              >
                <Text style={s.primaryBtnText}>{t('pos.printers.save')}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={[s.addPhaseLabel, { color: colors.danger }]}>
                {t('pos.printers.testError')}: {testError}
              </Text>
              <Pressable
                style={[s.primaryBtn, { backgroundColor: colors.brand, marginTop: 12 }]}
                onPress={handleConfirmWidth}
              >
                <Text style={s.primaryBtnText}>{t('pos.printers.retry')}</Text>
              </Pressable>
            </>
          )}
          <Pressable onPress={resetAddFlow} style={s.cancelRow}>
            <Text style={[s.cancelText, { color: colors.danger }]}>
              {t('common.cancel', { defaultValue: 'Cancelar' })}
            </Text>
          </Pressable>
        </View>
      );
    }

    return null;
  }

  return (
    <View style={[s.root, { backgroundColor: colors.bgBase }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.borderSubtle }]}>
        <Pressable
          style={s.backBtn}
          onPress={() => nav.canGoBack() && nav.goBack()}
          hitSlop={12}
          accessibilityLabel="Regresar"
        >
          <IconChevronLeft size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>
          {t('pos.printers.title')}
        </Text>
        <View style={s.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Bluetooth section ─────────────────────────────────────────────── */}
        <View style={s.sectionHeader}>
          <IconBluetoothConnected size={15} color={colors.brand} strokeWidth={2} />
          <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>
            {t('pos.printers.btSection')}
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginVertical: 16 }} />
        ) : btPrinters.length === 0 ? (
          <Text style={[s.emptyHint, { color: colors.textTertiary }]}>
            {t('pos.printers.noBtSaved')}
          </Text>
        ) : (
          btPrinters.map((p) => (
            <View key={p.address} style={[s.printerCard, { backgroundColor: colors.bgSurface }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.printerName, { color: colors.textPrimary }]}>
                  {p.alias ?? p.name}
                </Text>
                <Text style={[s.printerSub, { color: colors.textSecondary }]}>
                  {p.address} · {p.widthMm} mm
                </Text>
              </View>
              <Pressable
                style={[s.iconBtn, { borderColor: colors.brand }]}
                onPress={() => handleTestPrint(p)}
                accessibilityLabel="Imprimir prueba"
              >
                <IconPrinter size={16} color={colors.brand} strokeWidth={1.8} />
              </Pressable>
              <Pressable
                style={[s.iconBtn, { borderColor: colors.danger, marginLeft: 6 }]}
                onPress={() => handleRemove(p.address)}
                accessibilityLabel="Quitar impresora"
              >
                <IconTrash size={16} color={colors.danger} strokeWidth={1.8} />
              </Pressable>
            </View>
          ))
        )}

        {/* Add button */}
        {addPhase === 'idle' && (
          <Pressable
            style={({ pressed }) => [
              s.addBtn,
              { borderColor: colors.brand, opacity: pressed ? 0.7 : 1 },
            ]}
            onPress={handleStartAdd}
          >
            <IconPlus size={16} color={colors.brand} strokeWidth={2} />
            <Text style={[s.addBtnText, { color: colors.brand }]}>
              {t('pos.printers.addBt')}
            </Text>
          </Pressable>
        )}

        {/* Add flow inline card */}
        {renderAddFlow()}

        {/* ── Network section ───────────────────────────────────────────────── */}
        <View style={[s.sectionHeader, { marginTop: 24 }]}>
          <IconWifi size={15} color={colors.textSecondary} strokeWidth={2} />
          <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>
            {t('pos.printers.netSection')}
          </Text>
        </View>
        <Text style={[s.netHint, { color: colors.textTertiary }]}>
          {t('pos.printers.netHint')}
        </Text>

        {netPrinters.length === 0 ? (
          <Text style={[s.emptyHint, { color: colors.textTertiary }]}>
            {t('pos.printers.noNetPrinters')}
          </Text>
        ) : (
          netPrinters.map((p) => (
            <View key={p.id} style={[s.printerCard, { backgroundColor: colors.bgSurface }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.printerName, { color: colors.textPrimary }]}>{p.label}</Text>
                <Text style={[s.printerSub, { color: colors.textSecondary }]}>
                  {p.host}:{p.port} · {p.width_mm} mm
                </Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(colors: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    root:        { flex: 1 },
    header:      { flexDirection: 'row', alignItems: 'center', paddingBottom: 10, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
    backBtn:     { width: 36, height: 36, justifyContent: 'center' },
    headerTitle: { flex: 1, fontSize: 17, fontWeight: '600', textAlign: 'center' },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 20, marginBottom: 8 },
    sectionTitle:  { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
    emptyHint:   { fontSize: 13, marginBottom: 8 },
    netHint:     { fontSize: 12, marginBottom: 10 },
    printerCard: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 10,
      padding: 12,
      marginBottom: 8,
    },
    printerName: { fontSize: 15, fontWeight: '600' },
    printerSub:  { fontSize: 12, marginTop: 2 },
    iconBtn: {
      width: 34,
      height: 34,
      borderRadius: 8,
      borderWidth: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 10,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      marginTop: 8,
      justifyContent: 'center',
    },
    addBtnText: { fontSize: 15, fontWeight: '600' },
    addCard: {
      borderRadius: 12,
      padding: 16,
      marginTop: 8,
    },
    addCardTitle:  { fontSize: 15, fontWeight: '600', marginBottom: 8 },
    addPhaseLabel: { fontSize: 13, marginTop: 8 },
    deviceRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle },
    deviceName:    { fontSize: 15, fontWeight: '500' },
    deviceAddr:    { fontSize: 12 },
    widthChip: {
      paddingHorizontal: 18,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
    },
    widthChipText: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
    primaryBtn: {
      paddingVertical: 13,
      borderRadius: 10,
      alignItems: 'center',
    },
    primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
    cancelRow:      { marginTop: 12, alignItems: 'center' },
    cancelText:     { fontSize: 14, fontWeight: '500' },
  });
}
