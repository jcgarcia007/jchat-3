/**
 * Web stub for react-native-bluetooth-classic (Metro alias, web only — see metro.config.js).
 * Covers the default-export methods used by services/btPrinter.ts:
 * isBluetoothEnabled, getBondedDevices, connectToDevice. BluetoothDevice is type-only.
 */

const unavailable = (): Promise<never> => Promise.reject(new Error('unavailable_web'));

const RNBluetoothClassic = {
  isBluetoothEnabled: unavailable,
  getBondedDevices: unavailable,
  connectToDevice: unavailable,
};

export default RNBluetoothClassic;
