/**
 * JChat 3.0 — AppModal (iOS / Android): React Native's own Modal, untouched. Every modal of the app goes through
 * AppModal so the web build (AppModal.web.tsx) can keep them inside the phone-width column of the app instead of
 * painting over the whole browser window. scripts/app-modal.test.mjs fails if a file imports Modal from
 * react-native directly.
 */

import { Modal } from 'react-native';

export const AppModal = Modal;
export type { ModalProps as AppModalProps } from 'react-native';
export default AppModal;
