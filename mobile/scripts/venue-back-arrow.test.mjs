// The back arrow of the venue chat only MINIMIZES: it goes back and the venue session lives on (the provider takes the heartbeat over through
// setChatMounted(false)). The session ends only through "Salir del local" (confirmed) or a confirmed exit from the radius (utils/exitCheck.ts).
// Static guards so nobody wires leaveVenue / endSession into the arrow, a back gesture or an unmount cleanup. Run from mobile/:
//   node --test scripts/venue-back-arrow.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
/** Source without comments, so a sentence that mentions endSession does not count as a call. */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const chat = code('screens/chat/ChatRoomScreen.tsx');
const ENDS = /\b(?:leaveVenue|endSession)\b/;

test('handleBack (the arrow, "Not now" and the Android back) only goes back', () => {
  const start = chat.indexOf('const handleBack = useCallback(');
  assert.ok(start > 0, 'handleBack exists');
  const end = chat.indexOf(']);', start);
  const body = chat.slice(start, end);
  assert.match(body, /goBackOrHome\(navigation\)/);
  assert.doesNotMatch(body, ENDS);
});

test('the chat top bar and the entry gate use handleBack for the arrow and "Not now"', () => {
  assert.match(chat, /onBack=\{handleBack\}/);
  assert.match(chat, /testID="chat-entry-cancel"\s+onPress=\{handleBack\}/);
});

test('goBackOrHome (utils/navFlow.ts) never touches the venue session', () => {
  assert.doesNotMatch(code('utils/navFlow.ts'), ENDS);
  assert.doesNotMatch(code('utils/navFlow.ts'), /VenueSession/);
});

test('no unmount cleanup of the chat ends the session; the one about the venue only says the chat is no longer on screen', () => {
  for (const m of chat.matchAll(/return \(\) =>[^;]*;/g)) assert.doesNotMatch(m[0], ENDS, m[0]);
  for (const m of chat.matchAll(/useEffect\(\(\) => \(\) => \{[\s\S]*?\}, \[[^\]]*\]\);/g)) assert.doesNotMatch(m[0], ENDS, m[0].slice(0, 80));
  assert.match(chat, /setChatMounted\(true\);\s*return \(\) => setChatMounted\(false\);/);
});

test('the chat ends the session in exactly two places: a confirmed exit from the radius and the confirmed "Salir del local"', () => {
  const calls = [...chat.matchAll(/\b(?:venue\.)?(leaveVenue|endSession)\(/g)].map((m) => m[1]);
  assert.deepEqual(calls.sort(), ['endSession', 'leaveVenue']);
  const expelled = chat.slice(chat.indexOf('const handleExpelled = useCallback('), chat.indexOf('const geoGate = useGeofenceGate('));
  assert.match(expelled, /venue\.endSession\('expelled'\)/);
  const leave = chat.slice(chat.indexOf('const handleLeaveVenue = useCallback('));
  assert.match(leave.slice(0, 900), /venue\.leaveVenue\(\)/);
});

test('useGeofenceGate and usePresenceChannels never end the session, not even in their cleanups', () => {
  for (const file of ['screens/chat/useGeofenceGate.ts', 'screens/chat/usePresenceChannels.ts']) {
    assert.doesNotMatch(code(file), ENDS, file);
    assert.doesNotMatch(code(file), /useVenueSession/, file);
  }
  // The gate only reports a CONFIRMED exit through the callback the screen gives it.
  assert.match(code('screens/chat/useGeofenceGate.ts'), /onExpelledRef\.current\(\);/);
});

test('the provider keeps the session when the chat unmounts: setChatMounted only flips the heartbeat owner', () => {
  const provider = code('context/VenueSessionContext.tsx');
  const start = provider.indexOf('const setChatMounted = useCallback(');
  const body = provider.slice(start, provider.indexOf(']);', start));
  assert.doesNotMatch(body, ENDS);
  assert.match(body, /chatMountedRef\.current = mounted;/);
});
