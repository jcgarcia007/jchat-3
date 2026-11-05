/**
 * JChat 3.0 — what the location gate shows, as a pure function of the permission and the last reading.
 *   permission: 'granted' | 'denied' (the system will not ask again → Settings) | 'askable' (never asked, or the
 *               system still lets the app ask) ;  reading: 'ok' | 'error' | 'none' (not tried yet).
 * Titles and buttons are i18n keys of the chat namespace (chatRoom.*).
 */

export type PermissionKind = 'granted' | 'denied' | 'askable';
export type ReadingKind = 'ok' | 'error' | 'none';
export type LocationGateState = 'idle' | 'permission_denied' | 'position_error';
export type LocationGateButton = 'allow' | 'openSettings' | 'retry' | null;

export interface LocationGateView {
  state: LocationGateState;
  titleKey: string | null;
  bodyKey: string | null;
  button: LocationGateButton;
}

export function locationGateView(input: { permission: PermissionKind; reading: ReadingKind }): LocationGateView {
  if (input.permission !== 'granted') {
    return {
      state: 'permission_denied',
      titleKey: 'chatRoom.geoPermissionTitle',
      bodyKey: input.permission === 'denied' ? 'chatRoom.geoPermissionBlockedBody' : 'chatRoom.geoWhy',
      button: input.permission === 'denied' ? 'openSettings' : 'allow',
    };
  }
  if (input.reading === 'error') {
    return { state: 'position_error', titleKey: 'chatRoom.geoNoReadingTitle', bodyKey: 'chatRoom.geoNoReadingBody', button: 'retry' };
  }
  return { state: 'idle', titleKey: null, bodyKey: null, button: null };
}
