/**
 * JChat 3.0 — screens that the client web app does not need up front (web): loaded on demand.
 *
 * Expo CLI splits the web bundle at every async `import()` (docs.expo.dev/guides/customizing-metro, "Bundle
 * splitting"; web only), so the Map tab and the whole POS flow (the waiter / staff screens, receipts, printers,
 * terminal) are fetched the first time someone opens them, not with the first page. iOS / Android keep static
 * imports (lazyScreens.ts), so nothing changes there.
 *
 * Each lazy screen has its own Suspense fallback (a spinner) and an error boundary: if the chunk cannot be
 * downloaded (offline, a deploy replaced the old files) the person gets "No pudimos cargar esta pantalla ·
 * Reintentar" instead of a blank app, and Retry fetches the chunk again.
 */

import React from 'react';
import { lazyScreen } from './lazyScreen';

export const MapScreen: React.ComponentType = lazyScreen(() => import('../screens/map/MapScreen'));
export const PosNavigator: React.ComponentType = lazyScreen(() => import('./PosNavigator'));
// The signed-in person's messages / notifications and nearby offers (MainStack WebMessages / WebOffers).
export const MessagesScreen: React.ComponentType = lazyScreen(() => import('../screens/dms/MessagesScreen'));
export const OffersScreen: React.ComponentType = lazyScreen(() => import('../screens/offers/OffersScreen'));
