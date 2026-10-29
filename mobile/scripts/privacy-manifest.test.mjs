// The privacy manifest's collected data types (app.config.ts) must match the table we copy into App Store Connect
// (docs/store-listing/app-privacy-labels.md), and nothing may be flagged as tracking.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const config = readFileSync(join(root, 'mobile', 'app.config.ts'), 'utf8');
const doc = readFileSync(join(root, 'docs', 'store-listing', 'app-privacy-labels.md'), 'utf8');

const inConfig = [...config.matchAll(/^\s*collected\('(\w+)'(?:, '(\w+)')?\)/gm)].map((m) => ({ type: m[1], purpose: m[2] ?? 'AppFunctionality' }));
const inDoc = [...doc.matchAll(/^\| ([A-Za-z ]+?) \| [A-Za-z ]+ \| Sí \| No \| (App Functionality|Analytics)/gm)].map((m) => m[1].replace(/ /g, ''));

test('the manifest declares the collected data and wires it into privacyManifests', () => {
  assert.ok(inConfig.length >= 13);
  assert.match(config, /NSPrivacyCollectedDataTypes: COLLECTED_DATA_TYPES/);
  assert.match(config, /NSPrivacyTracking: false/);
});

test('nothing collected is linked to tracking', () => {
  assert.match(config, /NSPrivacyCollectedDataTypeTracking: false/);
  assert.doesNotMatch(config, /NSPrivacyCollectedDataTypeTracking: true/);
});

test('location is Precise Location, App Functionality, as agreed', () => {
  const loc = inConfig.find((d) => d.type === 'PreciseLocation');
  assert.ok(loc);
  assert.equal(loc.purpose, 'AppFunctionality');
});

test('photos or videos are declared (profile, stories and verification selfies)', () => {
  assert.ok(inConfig.some((d) => d.type === 'PhotosorVideos'));
});

test('the App Store Connect table lists exactly the same types, in the same order', () => {
  assert.deepEqual(inDoc, inConfig.map((d) => d.type));
});
