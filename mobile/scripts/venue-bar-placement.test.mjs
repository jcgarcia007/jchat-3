// Unit tests for navigation/venueBarPlacement.ts (where the "Estás en {local}" bar shows). Run from mobile/:
//   node --test scripts/venue-bar-placement.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'venue-bar-'));
const source = readFileSync(new URL('../navigation/venueBarPlacement.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
writeFileSync(join(dir, 'venueBarPlacement.mjs'), outputText);
const { venueBarPlacement } = await import(pathToFileURL(join(dir, 'venueBarPlacement.mjs')).href);

test('the Map tab shows the bar (venue session and orders)', () => {
  assert.equal(venueBarPlacement('Map'), 'tabs');
});

test('an open DM conversation shows the bar (venue session only)', () => {
  assert.equal(venueBarPlacement('DMChat'), 'detached');
});

test('Profile, Messages (the list), Nearby, Offers and the DM inbox do NOT show the bar', () => {
  for (const route of ['Profile', 'Messages', 'Nearby', 'Offers', 'DMInbox']) {
    assert.equal(venueBarPlacement(route), 'hidden', route);
  }
});

test('the venue chat itself, orders, settings and everything else stay hidden', () => {
  for (const route of ['ChatRoom', 'MyOrders', 'OrderTracking', 'SettingsHome', 'Privacy', 'ProfileSheet', 'UserProfile', 'Menu', 'Cart', 'Checkout', 'Onboarding', 'Login', 'Friends', 'MatchHome']) {
    assert.equal(venueBarPlacement(route), 'hidden', route);
  }
});

test('no route yet (navigation not ready) is hidden; names are exact, not prefixes', () => {
  assert.equal(venueBarPlacement(null), 'hidden');
  assert.equal(venueBarPlacement(''), 'hidden');
  assert.equal(venueBarPlacement('MapSettings'), 'hidden');
  assert.equal(venueBarPlacement('map'), 'hidden');
  assert.equal(venueBarPlacement('DMChatSettings'), 'hidden');
});
