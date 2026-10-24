/**
 * JChat 3.0 — screens that the client web app does not need up front (iOS / Android).
 *
 * On iOS / Android these are ordinary static imports, exactly as before. The web build resolves
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
import PosNavigatorComponent from './PosNavigator';
import MessagesScreenComponent from '../screens/dms/MessagesScreen';
import OffersScreenComponent from '../screens/offers/OffersScreen';

export const MapScreen: ComponentType = MapScreenComponent;
export const PosNavigator: ComponentType = PosNavigatorComponent;
/** Web only registers them in the MainStack (WebMessages / WebOffers); on devices they are the tabs. */
export const MessagesScreen: ComponentType = MessagesScreenComponent;
export const OffersScreen: ComponentType = OffersScreenComponent;
