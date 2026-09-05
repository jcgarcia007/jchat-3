// config-plugins/withAndroidMinSdkVersion.js
//
// Writes android.minSdkVersion=26 to gradle.properties during `expo prebuild`.
//
// WHY THIS EXISTS:
//   @stripe/stripe-terminal-react-native requires Android API 26+.
//   The react-native gradle catalog (libs.versions.toml) defaults minSdk to 24.
//   `useExpoVersionCatalog()` in settings.gradle only overrides that default
//   when it finds an `android.minSdkVersion` Gradle property in gradle.properties.
//   Without this plugin, EAS reruns `expo prebuild` on the server, regenerates
//   gradle.properties without the property, and the manifest merger fails.
//
// HOW IT WORKS:
//   `withGradleProperties` reads the generated gradle.properties result array,
//   removes any stale entry for the key, then pushes the correct value.
//   The property flows: gradle.properties → expoLibs version catalog (minSdk entry)
//   → ExpoRootProjectPlugin.setIfNotExist("minSdkVersion") → app/build.gradle.

const { withGradleProperties } = require('@expo/config-plugins');

const PROP_KEY = 'android.minSdkVersion';
const PROP_VALUE = '26';

/** @param {import('@expo/config-plugins').ExpoConfig} config */
module.exports = (config) =>
  withGradleProperties(config, (modConfig) => {
    // Remove any existing entry (handles re-runs and upgrades cleanly).
    modConfig.modResults = modConfig.modResults.filter(
      (item) => !(item.type === 'property' && item.key === PROP_KEY)
    );
    // Stripe Terminal requires minSdkVersion >= 26 (Android 8.0 Oreo).
    modConfig.modResults.push({ type: 'property', key: PROP_KEY, value: PROP_VALUE });
    return modConfig;
  });
