/**
 * JChat 3.0 — the version line of Settings ("1.0.0 (15)"), for support (H-029).
 *
 * Version: the Expo config (`expo-constants`). Build number: the NATIVE build, so an OTA update does not change it — read from `expo-application`
 * when the binary has it, else (iOS) from `Constants.platform.ios.buildNumber`. Nothing is added to the app: both modules are already installed, and a
 * missing native module only leaves the build number out.
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';

/** "1.0.0 (15)", "1.0.0" without a build number, or null when not even the version is known. Pure. */
export function formatAppVersion(version: string | null | undefined, build: string | number | null | undefined): string | null {
  const v = typeof version === 'string' ? version.trim() : '';
  if (!v) return null;
  const b = build === null || build === undefined ? '' : String(build).trim();
  return b ? `${v} (${b})` : v;
}

function nativeBuild(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const application = require('expo-application') as { nativeBuildVersion?: string | null } | undefined;
    if (application?.nativeBuildVersion) return application.nativeBuildVersion;
  } catch {
    /* the binary has no such native module: fall through */
  }
  if (Platform.OS === 'ios') return Constants.platform?.ios?.buildNumber ?? null;
  return null;
}

export function appVersionLabel(): string | null {
  return formatAppVersion(Constants.expoConfig?.version, nativeBuild());
}
