// config-plugins/withBluetoothClassicPermissions.js
//
// Adds Android permissions required for Bluetooth Classic (SPP/RFCOMM) printers.
// Used by Tab POS F7 — react-native-bluetooth-classic (NT-1809 58mm, M860 80mm).
//
// WHY THIS EXISTS:
//   @stripe/stripe-terminal-react-native already injects BLUETOOTH_CONNECT and
//   BLUETOOTH_SCAN via its own merged AAR manifest, but without the
//   `neverForLocation` flag on BLUETOOTH_SCAN. For SPP Classic printers we do
//   NOT derive location data, so that flag is required on Android 12+
//   (targetSdk >= 31) to avoid triggering the location-permission coupling.
//   We also add the legacy BLUETOOTH / BLUETOOTH_ADMIN with maxSdkVersion=30
//   for Android ≤ 11 compatibility.
//
//   Per Android developer docs (verified 2026-09-11):
//     targetSdk >= 31: BLUETOOTH_SCAN (neverForLocation) + BLUETOOTH_CONNECT — runtime
//     legacy:          BLUETOOTH + BLUETOOTH_ADMIN (maxSdkVersion=30)
//     NO ACCESS_FINE_LOCATION for SPP Classic printers.
//
// HOW IT WORKS:
//   `withAndroidManifest` injects <uses-permission> nodes directly into the
//   merged AndroidManifest.xml during `expo prebuild`. Idempotent: removes
//   existing entries for the same permission names before re-inserting, so
//   re-running prebuild is safe.

const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Remove any existing <uses-permission> entries for the given permission name.
 * Handles the case where Stripe Terminal has already injected them without flags.
 */
function removePermission(manifest, name) {
  if (!manifest.manifest['uses-permission']) return;
  manifest.manifest['uses-permission'] = manifest.manifest['uses-permission'].filter(
    (p) => p.$?.['android:name'] !== name,
  );
}

/**
 * Add a <uses-permission> node with optional extra attributes.
 */
function addPermission(manifest, name, extras = {}) {
  if (!manifest.manifest['uses-permission']) {
    manifest.manifest['uses-permission'] = [];
  }
  manifest.manifest['uses-permission'].push({
    $: { 'android:name': name, ...extras },
  });
}

/** @param {import('@expo/config-plugins').ExpoConfig} config */
module.exports = (config) =>
  withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults;

    // ── Android 12+ (API 31+) ────────────────────────────────────────────────
    // BLUETOOTH_SCAN: required to list bonded/paired devices.
    //   neverForLocation: we do NOT derive location from BT scan results.
    removePermission(manifest, 'android.permission.BLUETOOTH_SCAN');
    addPermission(manifest, 'android.permission.BLUETOOTH_SCAN', {
      'android:usesPermissionFlags': 'neverForLocation',
    });

    // BLUETOOTH_CONNECT: required to connect to a bonded (paired) device.
    removePermission(manifest, 'android.permission.BLUETOOTH_CONNECT');
    addPermission(manifest, 'android.permission.BLUETOOTH_CONNECT');

    // ── Android ≤ 11 (API 30 and below) ─────────────────────────────────────
    // Legacy permissions — ignored by Android 12+ because of maxSdkVersion.
    removePermission(manifest, 'android.permission.BLUETOOTH');
    addPermission(manifest, 'android.permission.BLUETOOTH', {
      'android:maxSdkVersion': '30',
    });

    removePermission(manifest, 'android.permission.BLUETOOTH_ADMIN');
    addPermission(manifest, 'android.permission.BLUETOOTH_ADMIN', {
      'android:maxSdkVersion': '30',
    });

    return modConfig;
  });
