/**
 * JChat 3.0 — AppModal (web). React Native's Modal on the web paints over the WHOLE browser window, but on screens
 * wider than 560 px the app lives in a 480 px column (WebFrame). Here the modal's content — and so its dimmed
 * backdrop, which every sheet draws as a full-size overlay inside it — is confined to that column: same left edge and
 * width as WebFrame, including the shift to the left while the profile / menu side panel is open.
 * On screens <= 560 px (a phone) it is exactly React Native's Modal, as before.
 */

import React from 'react';
import { Modal, StyleSheet, View, useWindowDimensions, type ModalProps } from 'react-native';

import { WEB_COLUMN_WIDTH, WEB_WIDE_BREAKPOINT } from '../../utils/appWindow.web';
import { columnLeftWithPanel } from '../../utils/profilePanelLayout';
import { useProfilePanelOpen } from '../../utils/profilePanelStore';

export type AppModalProps = ModalProps;

export function AppModal({ children, ...rest }: AppModalProps): React.ReactElement {
  const { width } = useWindowDimensions();
  const panelOpen = useProfilePanelOpen();

  if (width <= WEB_WIDE_BREAKPOINT) return <Modal {...rest}>{children}</Modal>;

  const left = panelOpen ? columnLeftWithPanel(width) : (width - WEB_COLUMN_WIDTH) / 2;
  return (
    <Modal {...rest}>
      <View style={[styles.column, { left, width: WEB_COLUMN_WIDTH }]} pointerEvents="box-none" testID="app-modal-column">
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  column: { position: 'absolute', top: 0, bottom: 0 },
});

export default AppModal;
