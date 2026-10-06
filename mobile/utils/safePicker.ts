import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import i18n from '../i18n';

/**
 * Opens the photo library / camera and never leaves a rejected promise behind: if the native picker
 * cannot start (no picker app on the device, revoked permission…) the person gets a translated notice
 * and the caller receives null.
 */
export async function safeLaunchLibrary(
  options: ImagePicker.ImagePickerOptions,
): Promise<ImagePicker.ImagePickerResult | null> {
  try {
    return await ImagePicker.launchImageLibraryAsync(options);
  } catch (err) {
    console.warn('[picker] launchImageLibraryAsync failed:', err);
    Alert.alert(i18n.t('common:picker.photosErrorTitle'), i18n.t('common:picker.photosErrorMessage'));
    return null;
  }
}

export async function safeLaunchCamera(
  options: ImagePicker.ImagePickerOptions,
): Promise<ImagePicker.ImagePickerResult | null> {
  try {
    return await ImagePicker.launchCameraAsync(options);
  } catch (err) {
    console.warn('[picker] launchCameraAsync failed:', err);
    Alert.alert(i18n.t('common:picker.cameraErrorTitle'), i18n.t('common:picker.cameraErrorMessage'));
    return null;
  }
}
