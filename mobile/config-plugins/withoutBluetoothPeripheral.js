// config-plugins/withoutBluetoothPeripheral.js
//
// Removes NSBluetoothPeripheralUsageDescription from Info.plist (B10-2).
//
// WHY THIS EXISTS:
//   JChat only acts as a Bluetooth CENTRAL (it connects to Stripe Terminal readers); it never advertises as a peripheral.
//   @stripe/stripe-terminal-react-native's plugin writes NSBluetoothPeripheralUsageDescription ALWAYS (with a default
//   English text when the option is omitted), so leaving the option out of app.config.ts is not enough.
//
// ORDER MATTERS: Expo runs the Info.plist mods of the LAST registered plugin first. This plugin must be registered BEFORE the
// Terminal plugin in app.config.ts so that its removal runs after Terminal has written the key.

const { withInfoPlist } = require('@expo/config-plugins');

const KEY = 'NSBluetoothPeripheralUsageDescription';

/** @param {import('@expo/config-plugins').ExpoConfig} config */
module.exports = (config) =>
  withInfoPlist(config, (modConfig) => {
    delete modConfig.modResults[KEY];
    return modConfig;
  });

module.exports.KEY = KEY;
