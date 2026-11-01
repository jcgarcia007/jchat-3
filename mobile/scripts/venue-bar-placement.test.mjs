// Unit tests for navigation/venueBarPlacement.ts (where the VenueDock — "Estás en {local}" + orders in progress — shows). Run from mobile/:
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

test('the five tab screens show the dock (the card sits above the tab bar)', () => {
  for (const route of ['Map', 'Nearby', 'Offers', 'Messages', 'Profile']) assert.equal(venueBarPlacement(route), 'dock', route);
});

test('on the web (no tabs) the home and its two sections show it', () => {
  for (const route of ['Tabs', 'WebMessages', 'WebOffers']) assert.equal(venueBarPlacement(route), 'dock', route);
});

test('an open DM, the DM inbox, the venue chat and everything stacked over the tabs stay hidden', () => {
  for (const route of ['DMChat', 'DMInbox', 'ChatRoom', 'MyOrders', 'OrderTracking', 'SettingsHome', 'Privacy', 'ProfileSheet', 'UserProfile', 'PostDetail', 'Menu', 'Cart', 'Checkout', 'PaymentSuccess', 'Onboarding', 'Login', 'Friends', 'MatchHome']) {
    assert.equal(venueBarPlacement(route), 'hidden', route);
  }
});

test('no route yet (navigation not ready) is hidden; names are exact, not prefixes', () => {
  assert.equal(venueBarPlacement(null), 'hidden');
  assert.equal(venueBarPlacement(''), 'hidden');
  assert.equal(venueBarPlacement('MapSettings'), 'hidden');
  assert.equal(venueBarPlacement('map'), 'hidden');
  assert.equal(venueBarPlacement('ProfileTabs'), 'hidden');
});
