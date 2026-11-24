/**
 * Stub for react-native-bluetooth-classic (Metro alias on every platform — see metro.config.js; the package is not linked on devices).
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
