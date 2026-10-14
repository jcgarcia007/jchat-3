/**
 * JChat 3.0 — opening the photo library. The ONE place the app does it.
 *
 * No library permission is requested, on any platform. Expo's ImagePicker docs (SDK 57): "No permissions request is
 * necessary for launching the image library" — the picker is the system's own UI (iOS: PHPicker / UIImagePickerController,
 * which run out of process; Android: the system picker / ACTION_GET_CONTENT, which hands the app a URI grant for the one
 * photo that was picked), so the app never reads the library. The only exception in the docs is VIDEO on iOS with
 * `videoExportPreset: 'Passthrough'`; this app only picks images.
 *
 * Why it matters: app.config.ts blocks READ_EXTERNAL_STORAGE / WRITE_EXTERNAL_STORAGE / READ_MEDIA_* in the Android
 * manifest (Play policy). `requestMediaLibraryPermissionsAsync()` on Android < 13 asks for exactly those, so with
 * them blocked it answers "denied" without a dialog and any screen that required "granted" would never open the picker.
 * (On Android 13+ it asks for nothing and answers "granted"; on web it does nothing.) scripts/photo-picker-usage.test.mjs
 * keeps the permission calls out of the code base.
 *
 * The CAMERA keeps its permission (launchCameraAsync needs it): use safeLaunchCamera after
 * ImagePicker.requestCameraPermissionsAsync() as before.
 */

import type * as ImagePicker from 'expo-image-picker';

import { safeLaunchLibrary } from '../utils/safePicker';

/** Options of a photo pick. `mediaTypes` is not accepted: it is always images (a video pick on iOS is the one case that needs permission). */
export type PhotoLibraryOptions = Omit<ImagePicker.ImagePickerOptions, 'mediaTypes'>;

/**
 * Opens the system photo picker (one image, or several with allowsMultipleSelection) and resolves with the result (EXIF rotation applied), or null when the
 * picker could not start (a translated notice has been shown). A cancelled pick resolves with `canceled: true`.
 */
export function pickPhotoFromLibrary(options: PhotoLibraryOptions = {}): Promise<ImagePicker.ImagePickerResult | null> {
  return safeLaunchLibrary({ ...options, mediaTypes: ['images'] });
}
