// The VenueDock (the "Estás en {local}" card above the tab bar). Static checks on the component, how the screens leave room for it and where it is
// mounted. Run from mobile/:  node --test scripts/venue-dock.test.mjs
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const dock = read('components/venue/VenueDock.tsx');

test('the card is a GlassSurface bar (the tab bar\'s material) with radius 18, padding 8/8/8/11 and 16 pt side margins', () => {
  assert.match(dock, /<GlassSurface variant="bar" style=\{styles\.card\}>/);
  assert.match(dock, /const CARD_RADIUS = 18;/);
  assert.match(dock, /paddingTop: 8,\s*paddingRight: 8,\s*paddingBottom: 8,\s*paddingLeft: 11,/);
  assert.match(dock, /const SIDE_MARGIN = 16;/);
});

test('it sits 8 pt above the tab bar\'s rising centre button (on the web, 8 pt above the bottom edge)', () => {
  assert.match(dock, /const GAP = 8;/);
  assert.match(dock, /const TAB_BAR_LIFT = 26;/);
  assert.match(dock, /const BUTTON_RISE = BUTTON_SIZE \/ 2 - CENTER_Y;/);
  assert.match(dock, /IS_WEB \? insets\.bottom \+ GAP : TAB_BAR_LIFT \+ insets\.bottom \+ BAR_HEIGHT \+ BUTTON_RISE \+ GAP/);
  assert.match(dock, /\(IS_WEB \? insets\.bottom \+ GAP : BUTTON_RISE\)/, 'the space it reserves includes the rise');
  assert.match(read('components/navigation/NotchTabBar.tsx'), /bottom: 26 \+ insets\.bottom/);
});

test('row 1: live dot (success token), name, unread badge (danger, only when > 0), people on the right', () => {
  assert.match(dock, /backgroundColor: palette\.success/);
  assert.match(dock, /\{unreadMessages > 0 \? \(/);
  assert.match(dock, /backgroundColor: palette\.danger/);
  assert.match(dock, /testID="venue-dock-people"/);
  assert.match(dock, /\{people !== null \? \(/, 'without a count, only the name');
  assert.match(dock, /fetchPeopleCounts\(\[businessId\]\)/, 'the same server count the Map uses (venue_people_counts)');
});

test('row 2: "Volver al chat" (brand, flex 1, 30 pt, hitSlop to 44) and "Salir" (glass, danger text, 60 x 30)', () => {
  assert.match(dock, /backButton: \{ flex: 1, minHeight: BUTTON_HEIGHT/);
  assert.match(dock, /const BUTTON_HEIGHT = 30;/);
  assert.match(dock, /const LEAVE_WIDTH = 60;/);
  assert.match(dock, /backgroundColor: palette\.brandFill/);
  assert.match(dock, /color: c\.dangerText/);
  assert.match(dock, /hitSlop=\{\{ top: 7, bottom: 7 \}\}/);
  assert.match(dock, /onPress=\{\(\) => onOpenChat\(session\.roomId\)\}/);
});

test('Salir asks first (the shared confirmLeaveVenue) and only then leaves', () => {
  assert.match(dock, /void confirmLeaveVenue\(session\.businessName\)\.then\(\(accepted\) => \{\s*if \(accepted\) void leaveVenue\(\);/);
});

test('the orders live in a thin row under row 2 of the same card (same text, "Ver", swipe left to notifications); no session → only that row', () => {
  assert.match(dock, /testID="venue-dock-orders"/);
  assert.match(dock, /<SwipeAway onSwiped=\{moveOrdersToNotifications\}/);
  assert.match(dock, /const showCard = onScreen && \(!!session \|\| orders\.length > 0\);/);
  assert.match(dock, /\{session \? \(/);
});

test('accessibility: the session part is a group labelled "Estás en {local}", the two buttons have their own labels', () => {
  assert.match(dock, /role="group" aria-label=\{t\('venueSession\.here', \{ business: session\.businessName \}\)\}/);
  assert.match(dock, /accessibilityLabel=\{t\('venueSession\.backA11y'/);
  assert.match(dock, /accessibilityLabel=\{t\('venueSession\.dockLeaveA11y'/);
});

test('it hides while the keyboard is up (devices) and shows only where venueBarPlacement says "dock"', () => {
  assert.match(dock, /Keyboard\.addListener\(Platform\.OS === 'ios' \? 'keyboardWillShow' : 'keyboardDidShow'/);
  assert.match(dock, /const onScreen = placement === 'dock' && !keyboardUp;/);
});

test('the inset is a BOTTOM inset published through HomeBarInset (0 when hidden), and the five tab screens add it to their bottom padding', () => {
  assert.match(dock, /reportInset\(reserve\(event\.nativeEvent\.layout\.height\)\)/);
  assert.match(dock, /if \(!showCard\) reportInset\(0\);/);
  for (const file of ['screens/map/MapScreen.tsx', 'screens/nearby/NearbyScreen.tsx', 'screens/dms/MessagesScreen.tsx', 'screens/offers/OffersScreen.tsx', 'screens/profile/ProfileScreen.tsx']) {
    const src = read(file);
    assert.match(src, /useHomeBarInset\(\)/, file);
    assert.match(src, /\+ homeBarInset/, file);
    assert.doesNotMatch(src, /paddingTop: [^}]*homeBarInset/, `${file}: no longer a top inset`);
  }
  assert.match(read('screens/profile/ProfileScreen.tsx'), /route\.name === 'Profile' \? TAB_BAR_LIFT \+ insets\.bottom \+ BAR_HEIGHT \+ 24 \+ homeBarInset/);
  assert.match(read('screens/web/WebNoVenueScreen.tsx'), /paddingBottom: insets\.bottom \+ 24 \+ homeBarInset/);
  for (const file of ['screens/dms/DMChatScreen.tsx', 'screens/dms/DMInboxScreen.tsx']) assert.doesNotMatch(read(file), /HomeBarInset/, `${file}: hidden there, no inset`);
});

test('the dock replaces HomeStatusBar: mounted once, on devices AND on the web; the old bar is gone', () => {
  const nav = read('navigation/AppNavigator.tsx');
  assert.match(nav, /<VenueDock\s+placement=\{venueBarPlacement\(currentRoute\)\}/);
  assert.doesNotMatch(nav, /HomeStatusBar/);
  assert.doesNotMatch(nav, /Platform\.OS !== 'web' \? \(\s*<VenueDock/);
  assert.equal(existsSync(new URL('../components/venue/HomeStatusBar.tsx', import.meta.url)), false);
});

test('the new texts exist in en and es, same keys', () => {
  const en = JSON.parse(read('i18n/locales/en/chat.json')).venueSession;
  const es = JSON.parse(read('i18n/locales/es/chat.json')).venueSession;
  assert.deepEqual(Object.keys(en).sort(), Object.keys(es).sort());
  for (const key of ['dockBack', 'dockLeave', 'dockLeaveA11y', 'people_one', 'people_other', 'unreadA11y_one', 'unreadA11y_other']) assert.ok(en[key] && es[key], key);
  assert.equal(es.dockBack, 'Volver al chat');
  assert.equal(es.dockLeave, 'Salir');
});
