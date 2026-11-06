// config-plugins/withAndroidFontScaleConfigChanges.js
//
// Adds `fontScale` (and `density`) to android:configChanges of MainActivity (B7-2).
//
// WHY THIS EXISTS:
//   Without them, changing the system font size (or display size) while the app is open makes Android DESTROY and recreate
//   the activity: the open chat and the venue dock are lost. With them the activity survives and React Native re-renders with
//   the new scale (useWindowDimensions / PixelRatio.getFontScale() change; RN delivers it through onConfigurationChanged).
//
// Idempotent: tokens already present are not repeated.

const { withAndroidManifest } = require('@expo/config-plugins');

const TOKENS = ['fontScale', 'density'];

/** Returns the new android:configChanges value with `fontScale` and `density` added (existing order kept). */
function withTokens(value) {
  const current = (value ?? '').split('|').map((s) => s.trim()).filter(Boolean);
  for (const t of TOKENS) if (!current.includes(t)) current.push(t);
  return current.join('|');
}

/** Mutates a parsed AndroidManifest: MainActivity gets the tokens. Returns true when MainActivity was found. */
function addFontScaleConfigChanges(manifest) {
  const activities = manifest?.manifest?.application?.[0]?.activity ?? [];
  const main = activities.find((a) => /(^|\.)MainActivity$/.test(a.$?.['android:name'] ?? ''));
  if (!main) return false;
  main.$['android:configChanges'] = withTokens(main.$['android:configChanges']);
  return true;
}

/** @param {import('@expo/config-plugins').ExpoConfig} config */
module.exports = (config) =>
  withAndroidManifest(config, (modConfig) => {
    if (!addFontScaleConfigChanges(modConfig.modResults)) {
      throw new Error('withAndroidFontScaleConfigChanges: MainActivity not found in AndroidManifest.xml');
    }
    return modConfig;
  });

module.exports.withTokens = withTokens;
module.exports.addFontScaleConfigChanges = addFontScaleConfigChanges;
