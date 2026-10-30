/**
 * When must the app ask for the notification permission? (pure: no React Native, no expo-notifications, so a Node test can load it.)
 *
 * Why not just `status === 'undetermined'`: on Android 13+ with targetSdk >= 33, expo-notifications (NotificationPermissionsModule.kt) reports `denied`
 * whenever the permission is not granted, EVEN IF THE USER WAS NEVER ASKED; it never reports `undetermined`. Waiting for `undetermined` therefore meant
 * the system dialog never appeared on Android, `users.push_token` stayed NULL and no push arrived. `canAskAgain` is what tells a never-asked `denied`
 * (true) from a refused-twice one (false: Android blocks further prompts, so do not insist).
 */
export interface PushPermissionState {
  /** Platform.OS. */
  platform: string;
  /** `granted` | `denied` | `undetermined` (expo-notifications PermissionStatus). */
  status: string;
  canAskAgain: boolean;
  /** `granted` field of the permission response, when known. */
  granted?: boolean;
}

export function shouldRequestPushPermission({ platform, status, canAskAgain, granted }: PushPermissionState): boolean {
  if (granted === true || status === 'granted') return false;
  if (!canAskAgain) return false;
  if (status === 'undetermined') return true; // iOS and Android before 13
  return platform === 'android' && status === 'denied'; // Android 13+: never asked looks like `denied`
}
