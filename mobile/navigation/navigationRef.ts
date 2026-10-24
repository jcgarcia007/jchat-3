/**
 * JChat 3.0 — the root NavigationContainer's ref, shared by AppNavigator and by code that lives outside any screen
 * (VenueSessionContext). It is a module of its own so those files can use it without importing AppNavigator
 * (which imports the screens: a cycle).
 */

import { CommonActions, createNavigationContainerRef } from '@react-navigation/native';
import { Platform } from 'react-native';

import type { MainStackParamList } from './AppNavigator';
import { planMapReset } from './mapResetPlan';

export const navigationRef = createNavigationContainerRef<MainStackParamList>();

/**
 * Takes the app to the Map tab, dropping every screen above the tabs (the venue chat and whatever was opened over
 * it). Native: keeps the Tabs route that is already there (no remount) and activates its Map tab. Web has no map:
 * the root says "Saliste de {local}" (leftBusinessName). Does nothing until the container is ready.
 */
export function resetToMapTab(leftBusinessName?: string): void {
  if (!navigationRef.isReady()) return;
  if (Platform.OS === 'web') {
    navigationRef.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Tabs', params: { leftBusinessName } }] }));
    return;
  }
  const rootState = navigationRef.getRootState();
  const plan = planMapReset(rootState?.routes ?? []);
  if (plan.kind === 'keep' && rootState) {
    navigationRef.dispatch(
      CommonActions.reset({ ...rootState, routes: rootState.routes.slice(0, plan.count), index: plan.count - 1 }),
    );
  } else {
    navigationRef.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Tabs' }] }));
  }
  navigationRef.navigate('Tabs', { screen: 'Map' });
}
