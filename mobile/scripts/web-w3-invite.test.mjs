// W3: invite to the app (banner, 3 moments, store links) behind INVITE_TO_APP_ENABLED=false until launch.
// Run from mobile/:  node --test scripts/web-w3-invite.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'w3-invite-'));
function compile(rel, out, rewrites = []) {
  let src = read(rel);
  for (const [from, to] of rewrites) src = src.replace(from, to);
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  writeFileSync(join(dir, out), js);
}
compile('constants/appLinks.ts', 'appLinks.mjs');
compile('utils/storeLink.ts', 'storeLink.mjs', [[/from '\.\.\/constants\/appLinks'/, "from './appLinks.mjs'"]]);
compile('utils/venueQr.ts', 'venueQr.mjs');
compile('utils/entryUrl.ts', 'entryUrl.mjs', [[/from '\.\/venueQr'/, "from './venueQr.mjs'"]]);
compile('utils/inviteMoments.ts', 'inviteMoments.mjs', [[/from '\.\/entryUrl'/, "from './entryUrl.mjs'"]]);
const imp = (f) => import(pathToFileURL(join(dir, f)).href);
const links = await imp('appLinks.mjs');
const { storeLinkFor } = await imp('storeLink.mjs');
const m = await imp('inviteMoments.mjs');

// ── a tiny in-memory Storage ───────────────────────────────────────────────────────────────────────────────────────
const store = (initial = {}) => {
  const data = { ...initial };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => void (data[k] = String(v)), data };
};
const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const ctx = (over = {}) => ({ enabled: true, platform: 'web', local: store(), session: store(), memory: new Set(), now: NOW, ...over });

// ── 1. switch and links ─────────────────────────────────────────────────────────────────────────────────────────────
test('the master switch ships OFF (the app is not public in the stores yet)', () => {
  assert.equal(links.INVITE_TO_APP_ENABLED, false);
  assert.match(read('constants/appLinks.ts'), /export const INVITE_TO_APP_ENABLED = false;/);
});

test('storeLinkFor: iOS → App Store (id6824292679), Android → Play, anything else → jchat.cloud', () => {
  assert.equal(storeLinkFor('ios'), 'https://apps.apple.com/app/id6824292679');
  assert.equal(storeLinkFor('android'), 'https://play.google.com/store/apps/details?id=com.otunitylabs.jchat');
  assert.equal(storeLinkFor('desktop'), 'https://jchat.cloud');
  assert.equal(links.APP_STORE_URL, 'https://apps.apple.com/app/id6824292679');
});

test('the App Store id is the ascAppId of eas.json', () => {
  assert.match(read('eas.json'), /"ascAppId": "6824292679"/);
});

test('"Descargar la app" (no-venue screen and onboarding step 3) is hidden while the switch is off', () => {
  assert.match(read('screens/web/WebNoVenueScreen.tsx'), /\{INVITE_TO_APP_ENABLED \? \(\s*<Pressable\s+testID="web-download-app"/);
  assert.match(read('screens/onboarding/OnboardingScreen.tsx'), /IS_WEB && isLastStep && INVITE_TO_APP_ENABLED \? \(/);
});

// ── 2. banner: off with the switch, 7 days after closing ──────────────────────────────────────────────────────────────
test('switch off → no banner and no moment, whatever the storage says', () => {
  const off = ctx({ enabled: false });
  assert.equal(m.inviteAllowed(off), false);
  for (const moment of ['firstMessage', 'exitedArea', 'finished']) assert.equal(m.claimMoment(off, moment), false);
});

test('devices never invite (platform is not web), even with the switch on', () => {
  for (const platform of ['ios', 'android']) {
    const c = ctx({ platform });
    assert.equal(m.inviteAllowed(c), false);
    assert.equal(m.claimMoment(c, 'finished'), false);
  }
});

test('closing the banner hides it (and every moment) for 7 days, then it comes back', () => {
  const local = store();
  assert.equal(m.inviteAllowed(ctx({ local })), true);
  m.dismissBanner({ local, now: NOW });
  assert.equal(local.data['jchat.inviteBanner.dismissedAt'], String(NOW));
  assert.equal(m.inviteAllowed(ctx({ local, now: NOW + 1000 })), false);
  assert.equal(m.inviteAllowed(ctx({ local, now: NOW + 7 * DAY - 1 })), false, 'one ms before 7 days: still hidden');
  assert.equal(m.inviteAllowed(ctx({ local, now: NOW + 7 * DAY })), true, 'at 7 days it returns');
  assert.equal(m.claimMoment(ctx({ local, now: NOW + DAY }), 'firstMessage'), false, 'no moment while the banner is dismissed');
});

test('a broken or future dismissal date counts as "not closed"', () => {
  assert.equal(m.bannerDismissedRecently('not-a-date', NOW), false);
  assert.equal(m.bannerDismissedRecently(null, NOW), false);
  assert.equal(m.bannerDismissedRecently(String(NOW + DAY), NOW), false);
});

test('storage that throws (private mode) never breaks anything', () => {
  const angry = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  const c = ctx({ local: angry, session: angry });
  assert.equal(m.inviteAllowed(c), true);
  assert.doesNotThrow(() => m.dismissBanner({ local: angry, now: NOW }));
  assert.equal(m.claimMoment(c, 'finished'), true);
  assert.equal(m.claimMoment(c, 'finished'), false, 'the in-memory set still stops the repeat');
});

// ── 3. moments: once per session each ─────────────────────────────────────────────────────────────────────────────────
test('each moment shows ONCE per browser session; moments are independent', () => {
  const c = ctx();
  assert.equal(m.claimMoment(c, 'firstMessage'), true);
  assert.equal(c.session.data['jchat.invite.firstMessage'], String(NOW));
  assert.equal(m.claimMoment(c, 'firstMessage'), false);
  assert.equal(m.claimMoment(c, 'exitedArea'), true);
  assert.equal(m.claimMoment(c, 'finished'), true);
  assert.equal(m.claimMoment(c, 'finished'), false);
});

test('a new browser session (empty sessionStorage and memory) shows it again', () => {
  const local = store();
  assert.equal(m.claimMoment(ctx({ local }), 'finished'), true);
  assert.equal(m.claimMoment(ctx({ local }), 'finished'), true, 'new session');
});

// ── "Abrir": deep link, then the store ──────────────────────────────────────────────────────────────────────────────────
test('deepLinkForUrl: the jchat:// equivalent of the current URL, null when there is none', () => {
  assert.equal(m.deepLinkForUrl('https://jchat.cloud/c/abcdef123456'), 'jchat://c/abcdef123456');
  assert.equal(m.deepLinkForUrl('https://bar-xzx-omd2.jchat.cloud/c/abcdef123456'), 'jchat://c/abcdef123456');
  assert.equal(m.deepLinkForUrl('https://bar-xzx-omd2.jchat.cloud/'), 'jchat://v/bar-xzx-omd2');
  assert.equal(m.deepLinkForUrl('https://bar-xzx-omd2.jchat.cloud/8-k3f9'), 'jchat://v/bar-xzx-omd2/8-k3f9');
  assert.equal(m.deepLinkForUrl('https://bar-xzx-omd2.jchat.cloud/t/abcdef123456'), null, '/t/<token> has no jchat:// form');
  assert.equal(m.deepLinkForUrl('https://jchat.cloud/t/abcdef123456'), null);
  assert.equal(m.deepLinkForUrl('https://example.com/whatever'), null);
});

function fakeEnv(visible) {
  const log = { locations: [], scheduled: [] };
  return { log, env: { setLocation: (u) => log.locations.push(u), isVisible: () => visible(), schedule: (fn, ms) => log.scheduled.push({ fn, ms }) } };
}

test('Abrir with a deep link: tries it, and goes to the store only if the tab is still visible after 1.5 s', () => {
  let visible = true;
  const { log, env } = fakeEnv(() => visible);
  const url = 'https://bar-xzx-omd2.jchat.cloud/c/abcdef123456';
  assert.equal(m.openInApp({ href: url, storeUrl: 'https://store' }, env), 'deeplink');
  assert.deepEqual(log.locations, ['jchat://c/abcdef123456']);
  assert.equal(log.scheduled.length, 1);
  assert.equal(log.scheduled[0].ms, 1500);
  log.scheduled[0].fn(); // the app did not open: the page is still visible
  assert.deepEqual(log.locations, ['jchat://c/abcdef123456', 'https://store']);

  visible = false; // the app took over: the page went to the background
  const second = fakeEnv(() => visible);
  m.openInApp({ href: url, storeUrl: 'https://store' }, second.env);
  second.log.scheduled[0].fn();
  assert.deepEqual(second.log.locations, ['jchat://c/abcdef123456'], 'no store when the tab was hidden');
});

test('Abrir without a jchat:// equivalent goes straight to the store', () => {
  const { log, env } = fakeEnv(() => true);
  assert.equal(m.openInApp({ href: 'https://jchat.cloud/t/abcdef123456', storeUrl: 'https://store' }, env), 'store');
  assert.deepEqual(log.locations, ['https://store']);
  assert.equal(log.scheduled.length, 0);
});

// ── wiring (source) ───────────────────────────────────────────────────────────────────────────────────────────────────
test('devices: every invite surface is a no-op', () => {
  assert.match(read('components/web/OpenInAppBanner.tsx'), /export function OpenInAppBanner\(\): null \{\s*return null;/);
  assert.match(read('components/web/InviteToastHost.tsx'), /export function InviteToastHost\(\): null \{\s*return null;/);
  assert.match(read('hooks/useInviteMoment.ts'), /const NOOP: InviteMomentApi = \{ trigger: \(\) => undefined \};/);
  assert.match(read('services/inviteState.ts'), /export function claimInviteMoment\(_moment: InviteMoment\): boolean \{\s*return false;/);
});

test('the banner sits in the chat above the composer and on the no-venue screen, and nowhere in auth / onboarding / payment', () => {
  const chat = read('screens/chat/ChatRoomScreen.tsx');
  assert.ok(chat.indexOf('<OpenInAppBanner />') > 0 && chat.indexOf('<OpenInAppBanner />') < chat.indexOf('<ChatInput'), 'above ChatInput');
  assert.match(read('screens/web/WebNoVenueScreen.tsx'), /<OpenInAppBanner \/>/);
  for (const f of ['screens/onboarding/OnboardingScreen.tsx', 'screens/checkout/PaymentSuccessScreen.tsx', 'screens/checkout/CheckoutScreen.tsx', 'screens/auth/LoginScreen.tsx', 'screens/auth/RegisterStep1Screen.tsx']) {
    assert.doesNotMatch(read(f), /OpenInAppBanner/, f);
  }
});

test('closing the banner on one screen hides the copies mounted in the stack (chat + no-venue)', () => {
  const banner = read('components/web/OpenInAppBanner.web.tsx');
  assert.match(banner, /useEffect\(\(\) => subscribeBannerClosed\(\(\) => setVisible\(false\)\), \[\]\);/);
  assert.match(banner, /onPress=\{closeInviteBanner\}/);
  assert.match(read('services/inviteState.web.ts'), /bannerClosedListeners\.forEach\(\(listener\) => listener\(\)\);/);
  assert.match(read('services/inviteState.ts'), /export function subscribeBannerClosed/);
});

test('the three moments are triggered where the brief says', () => {
  const chat = read('screens/chat/ChatRoomScreen.tsx');
  assert.match(chat, /setMessages\(\(prev\) => settleOptimistic\(prev, optimisticId, confirmed\)\);\s*invite\.trigger\('firstMessage'\);/);
  assert.match(chat, /claimInviteMoment\('exitedArea'\) \? `\\n\\n\$\{t\('chatRoom\.geoRemovedInvite'\)\}`/);
  assert.match(read('context/VenueSessionContext.tsx'), /claimInviteMoment\('exitedArea'\)/);
  assert.match(read('screens/checkout/PaymentSuccessScreen.tsx'), /invite\.trigger\('finished'\)/);
  assert.match(read('screens/match/MatchItsAMatchScreen.tsx'), /invite\.trigger\('finished'\)/);
  assert.match(read('navigation/AppNavigator.tsx'), /<InviteToastHost \/>/);
});

test('the Smart App Banner meta stays commented until launch', () => {
  const html = read('public/index.html');
  assert.match(html, /<!--[^]*activar en el lanzamiento junto con INVITE_TO_APP_ENABLED[^]*<meta name="apple-itunes-app" content="app-id=6824292679" \/>\s*-->/);
  // not live: stripping comments leaves no such meta
  assert.doesNotMatch(html.replace(/<!--[^]*?-->/g, ''), /apple-itunes-app/);
});

test('es / en: the invite copy exists with the same keys', () => {
  const j = (l, f) => JSON.parse(read(`i18n/locales/${l}/${f}.json`));
  assert.deepEqual(Object.keys(j('es', 'common').invite), Object.keys(j('en', 'common').invite));
  for (const k of ['banner', 'open', 'openInApp', 'close', 'firstMessage', 'finished']) assert.ok(j('es', 'common').invite[k] && j('en', 'common').invite[k], k);
  assert.ok(j('es', 'chat').chatRoom.geoRemovedInvite && j('en', 'chat').chatRoom.geoRemovedInvite);
  assert.equal(Object.keys(j('es', 'chat').chatRoom).length, Object.keys(j('en', 'chat').chatRoom).length);
});
