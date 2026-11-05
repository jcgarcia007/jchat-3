// Run from mobile/:  node --test scripts/location-gate.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'loc-gate-'));
const file = join(dir, 'locationGate.mjs');
writeFileSync(file, ts.transpileModule(readFileSync(new URL('../utils/locationGate.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText);
const { locationGateView } = await import(pathToFileURL(file).href);
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

test('denied and the system will not ask again → Settings button, blocked body', () => {
  const v = locationGateView({ permission: 'denied', reading: 'none' });
  assert.deepEqual(v, { state: 'permission_denied', titleKey: 'chatRoom.geoPermissionTitle', bodyKey: 'chatRoom.geoPermissionBlockedBody', button: 'openSettings' });
});
test('not asked yet / askable → Allow button with the reason', () => {
  const v = locationGateView({ permission: 'askable', reading: 'none' });
  assert.equal(v.state, 'permission_denied');
  assert.equal(v.button, 'allow');
  assert.equal(v.bodyKey, 'chatRoom.geoWhy');
});
test('granted + reading error → position_error with Retry', () => {
  const v = locationGateView({ permission: 'granted', reading: 'error' });
  assert.equal(v.state, 'position_error');
  assert.equal(v.button, 'retry');
});
test('granted + reading ok or not tried → idle, nothing shown', () => {
  for (const reading of ['ok', 'none']) {
    assert.deepEqual(locationGateView({ permission: 'granted', reading }), { state: 'idle', titleKey: null, bodyKey: null, button: null });
  }
});
test('the permission title is never the "outside" title; es and en define every key', () => {
  const chat = read('../screens/chat/ChatRoomScreen.tsx');
  assert.match(chat, /permissionDenied\s*\n?\s*\? gt\('chatRoom\.geoPermissionTitle'\)/);
  assert.match(chat, /Linking\.openSettings\(\)/);
  assert.match(chat, /AppState\.addEventListener\('change'/);
  for (const l of ['es', 'en']) {
    const c = JSON.parse(read(`../i18n/locales/${l}/chat.json`)).chatRoom;
    const m = JSON.parse(read(`../i18n/locales/${l}/map.json`)).mapScreen;
    for (const k of ['geoPermissionTitle', 'geoPermissionBlockedBody', 'geoOpenSettings']) assert.ok(c[k], `${l} ${k}`);
    for (const k of ['prePermissionTitle', 'prePermissionBody', 'prePermissionContinue']) assert.ok(m[k], `${l} ${k}`);
  }
});
test('Map: the pre-permission screen is shown once, stored in AsyncStorage, before the system prompt', () => {
  const map = read('../screens/map/MapScreen.tsx');
  assert.match(map, /PRE_PERMISSION_SEEN_KEY/);
  assert.match(map, /AsyncStorage\.setItem\(PRE_PERMISSION_SEEN_KEY/);
  assert.match(map, /UNDETERMINED && seen !== 'true'/);
});
