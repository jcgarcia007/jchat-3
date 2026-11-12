/**
 * JChat 3.0 — native side of "Add to calendar" (M3, part D). Opens the system event editor prefilled; the app never reads the calendar.
 *
 * expo-calendar 57: the root export of createEventInCalendarAsync throws, so it comes from 'expo-calendar/legacy'.
 * Permission: Android launches the system editor (no permission). iOS 17+ shows the editor out of process (the write-only key covers it);
 * iOS < 17 needs the calendar permission first, asked here, only when the user taps the button.
 */

import { Platform } from 'react-native';
import { createEventInCalendarAsync, requestCalendarPermissionsAsync } from 'expo-calendar/legacy';

import type { ReservationCalendarEvent } from '../utils/reservationCalendar';

export type AddToCalendarResult = 'saved' | 'canceled' | 'denied';

export async function addReservationToCalendar(event: ReservationCalendarEvent): Promise<AddToCalendarResult> {
  if (Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) < 17) {
    const { granted } = await requestCalendarPermissionsAsync();
    if (!granted) return 'denied';
  }
  const result = await createEventInCalendarAsync(event);
  return result.action === 'canceled' || result.action === 'deleted' ? 'canceled' : 'saved';
}
