/**
 * JChat 3.0 — screens that the client web app does not need up front (iOS / Android).
 *
 * On iOS / Android these are ordinary static imports, exactly as before, except PosNavigator (Work Mode), which is loaded
 * on first use (lazyScreen) so the Stripe Terminal SDK is not evaluated at startup. The web build resolves
 * lazyScreens.web.tsx, which loads the same screens on demand (Expo CLI splits web bundles at async
 * `import()` — docs.expo.dev/guides/customizing-metro, "Bundle splitting") so the staff / map code is not in
 * the first download.
 *
 * The explicit `ComponentType` annotations are deliberate: without them TypeScript infers these constants from
 * the screens' own (navigation-typed) props, which loop back through BottomTabs / AppNavigator and overflow
 * the type checker's call stack.
 */

import type { ComponentType } from 'react';

import MapScreenComponent from '../screens/map/MapScreen';
import { lazyScreen } from './lazyScreen';
import MessagesScreenComponent from '../screens/dms/MessagesScreen';
import OffersScreenComponent from '../screens/offers/OffersScreen';

export const MapScreen: ComponentType = MapScreenComponent;
// Work Mode (POS): its module — and with it the Stripe Terminal SDK (beta, services/terminalSdk.ts) — is only evaluated when
// someone opens it, not at startup for everyone (B10-4). The native module stays compiled into the binary.
export const PosNavigator: ComponentType = lazyScreen(() => import('./PosNavigator'));
/** Web only registers them in the MainStack (WebMessages / WebOffers); on devices they are the tabs. */
export const MessagesScreen: ComponentType = MessagesScreenComponent;
export const OffersScreen: ComponentType = OffersScreenComponent;
