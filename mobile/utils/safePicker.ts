import { InteractionManager, Keyboard } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import i18n from '../i18n';
import { normalizeImageUri } from './normalizeImage';
import { showAlert } from './dialog';

/**
 * Opens the photo library / camera and never leaves a rejected promise behind: if the native picker
 * cannot start (no picker app on the device, revoked permission…) the person gets a translated notice
 * and the caller receives null. Picked photos come back with their EXIF rotation applied (normalizeImageUri).
 *
 * There is deliberately NO "picker in progress" lock: if the native promise never settled, a lock would keep
 * every later launch from opening. Instead each launch first lets the previous presentation finish (iOS silently
 * refuses to present a view controller while another one is still animating, and the call then never settles).
 */
const MIN_GAP_AFTER_PICKER_MS = 700;
const DOUBLE_TAP_MS = 600;
let lastClosedAt = 0;
let lastStartedAt = 0;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Keyboard down, navigation/animations settled and the previous picker fully dismissed. */
async function prepareToPresent(): Promise<boolean> {
  const now = Date.now();
  if (now - lastStartedAt < DOUBLE_TAP_MS) return false; // a double tap must not present twice
  lastStartedAt = now;
  Keyboard.dismiss();
  await new Promise<void>((resolve) => InteractionManager.runAfterInteractions(() => resolve()));
  const wait = MIN_GAP_AFTER_PICKER_MS - (Date.now() - lastClosedAt);
  if (wait > 0) await delay(wait);
  return true;
}

async function withNormalizedAssets(result: ImagePicker.ImagePickerResult): Promise<ImagePicker.ImagePickerResult> {
  if (result.canceled || !result.assets?.length) return result;
  const assets = await Promise.all(
    result.assets.map(async (asset) => {
      if (asset.type && asset.type !== 'image') return asset; // videos are not touched
      const normalized = await normalizeImageUri(asset.uri, asset.mimeType);
      return { ...asset, uri: normalized.uri, mimeType: normalized.mimeType };
    }),
  );
  return { ...result, assets };
}

/** The Android 13+ Photo Picker is not installed (ActivityNotFoundException for PICK_IMAGES). */
function isPhotoPickerMissing(err: unknown): boolean {
  return /ActivityNotFoundException|No Activity found to handle Intent/i.test(String((err as { message?: unknown })?.message ?? err));
}

export async function safeLaunchLibrary(
  options: ImagePicker.ImagePickerOptions,
): Promise<ImagePicker.ImagePickerResult | null> {
  try {
    if (!(await prepareToPresent())) return null;
    try {
      let result: ImagePicker.ImagePickerResult;
      try {
        result = await ImagePicker.launchImageLibraryAsync(options);
      } catch (err) {
        // Android 13+ opens the system Photo Picker (PICK_IMAGES); devices and emulators without that module throw
        // ActivityNotFoundException. The classic picker (ACTION_GET_CONTENT, `legacy: true`) needs no permission either.
        if (options.legacy || !isPhotoPickerMissing(err)) throw err;
        result = await ImagePicker.launchImageLibraryAsync({ ...options, legacy: true });
      }
      return await withNormalizedAssets(result);
    } finally {
      lastClosedAt = Date.now();
    }
  } catch (err) {
    console.warn('[picker] launchImageLibraryAsync failed:', err);
    showAlert(i18n.t('common:picker.photosErrorTitle'), i18n.t('common:picker.photosErrorMessage'));
    return null;
  }
}

export async function safeLaunchCamera(
  options: ImagePicker.ImagePickerOptions,
): Promise<ImagePicker.ImagePickerResult | null> {
  try {
    if (!(await prepareToPresent())) return null;
    try {
      const result = await ImagePicker.launchCameraAsync(options);
      return await withNormalizedAssets(result);
    } finally {
      lastClosedAt = Date.now();
    }
  } catch (err) {
    console.warn('[picker] launchCameraAsync failed:', err);
    showAlert(i18n.t('common:picker.cameraErrorTitle'), i18n.t('common:picker.cameraErrorMessage'));
    return null;
  }
}
