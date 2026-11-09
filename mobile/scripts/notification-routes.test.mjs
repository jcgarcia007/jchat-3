// The 18 notification types and where a tap on each goes. Run from mobile/:  node --test scripts/notification-routes.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const service = read('../services/notifications.ts');
const hook = read('../hooks/useNotifications.ts');

// routeForNotification is pure: extract it (types are erased by the transpile) and run it.
const start = service.indexOf('export function routeForNotification(');
const end = service.indexOf('/**', start);
const dir = mkdtempSync(join(tmpdir(), 'notif-route-'));
const file = join(dir, 'route.mjs');
writeFileSync(file, ts.transpileModule(service.slice(start, end), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText);
const { routeForNotification } = await import(pathToFileURL(file).href);

const union = service.slice(service.indexOf('export type NotificationType ='), service.indexOf('export const MATCH_NOTIFICATION_TYPES'));
const TYPES = [...union.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
const B = 'biz-1';

test('there are 18 types, and the hook accepts every one (derived from SOCIAL_NOTIFICATION_TYPES, not a hand-kept list)', () => {
  assert.equal(TYPES.length, 18);
  assert.match(hook, /new Set\(SOCIAL_NOTIFICATION_TYPES\)/);
  const social = service.slice(service.indexOf('export const SOCIAL_NOTIFICATION_TYPES'), service.indexOf('export function isSocialNotificationType'));
  for (const t of ['dm', 'follower', 'like', 'comment', 'work_alert']) assert.ok(social.includes(`'${t}'`), t);
  for (const g of ['MATCH_NOTIFICATION_TYPES', 'ORDER_NOTIFICATION_TYPES', 'MATCH_PHOTO_NOTIFICATION_TYPES', 'VENUE_CLOSED_NOTIFICATION_TYPES', 'STAFF_NOTIFICATION_TYPES']) assert.ok(social.includes(`...${g}`), g);
  const matchPhoto = service.match(/MATCH_PHOTO_NOTIFICATION_TYPES[^=]*=\s*\[([^\]]*)\]/)[1];
  assert.ok(matchPhoto.includes('match_photo_approved') && matchPhoto.includes('match_photo_rejected'));
});

test('the route of every type', () => {
  const table = {
    dm: [{ conversation_id: 'c1' }, { screen: 'DMs', params: { screen: 'DMChat', params: { conversationId: 'c1' } } }],
    follower: [{ from_user_id: 'u1' }, { screen: 'UserProfile', params: { userId: 'u1' } }],
    like: [{ post_id: 'p1' }, { screen: 'PostDetail', params: { postId: 'p1' } }],
    comment: [{ post_id: 'p1' }, { screen: 'PostDetail', params: { postId: 'p1' } }],
    match_like: [{ business_id: B }, { screen: 'MatchActivity', params: { businessId: B, tab: 'likedMe' } }],
    match_super: [{ business_id: B }, { screen: 'MatchActivity', params: { businessId: B, tab: 'likedMe' } }],
    match_match: [{ business_id: B }, { screen: 'MatchActivity', params: { businessId: B, tab: 'matches' } }],
    match_new_people: [{ business_id: B }, { screen: 'MatchHome', params: { businessId: B } }],
    match_photo_approved: [null, { screen: 'MatchMyProfile', params: { focus: 'result' } }],
    match_photo_rejected: [null, { screen: 'MatchMyProfile', params: { focus: 'result' } }],
    order_status: [{ order_id: 'o1' }, { screen: 'OrderTracking', params: { orderId: 'o1' } }],
    gift_offer: [{ conversation_id: 'c2' }, { screen: 'DMs', params: { screen: 'DMChat', params: { conversationId: 'c2' } } }],
    gift_response: [{ conversation_id: 'c2' }, { screen: 'DMs', params: { screen: 'DMChat', params: { conversationId: 'c2' } } }],
  };
  for (const [type, [payload, expected]] of Object.entries(table)) {
    assert.deepEqual(routeForNotification(type, payload), expected, type);
  }
  // work_alert has no route ON PURPOSE: it is an alert for the staff, shown in the list only.
  assert.equal(routeForNotification('work_alert', { anything: 1 }), null);
  // D4: a closed venue / a cancelled reservation have nothing to open either (the venue is gone for the client): the list shows them, a tap does nothing.
  assert.equal(routeForNotification('business_closed', { business_id: B }), null);
  assert.equal(routeForNotification('reservation_cancelled', { business_id: B }), null);
  // M2: staff_added opens the venue's chat when the notice carries its room, else nothing; staff_removed has nowhere to go
  assert.deepEqual(routeForNotification('staff_added', { business_id: B, room_id: 'room-1' }), { screen: 'ChatRoom', params: { id: 'room-1' } });
  assert.equal(routeForNotification('staff_added', { business_id: B }), null);
  assert.equal(routeForNotification('staff_added', null), null);
  assert.equal(routeForNotification('staff_added', { room_id: '' }), null);
  assert.equal(routeForNotification('staff_removed', { business_id: B, room_id: 'room-1' }), null);
  assert.deepEqual(Object.keys(table).concat('work_alert', 'business_closed', 'reservation_cancelled', 'staff_added', 'staff_removed').sort(), [...TYPES].sort());
});

test('a type this build does not know opens nothing', () => {
  assert.equal(routeForNotification('something_new', {}), null);
});
