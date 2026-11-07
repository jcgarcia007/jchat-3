// The privacy manifest's collected data types (app.config.ts) must match the table we copy into App Store Connect
// (docs/store-submission/01_app_privacy_apple.md, section 1), and nothing may be flagged as tracking.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const config = readFileSync(join(root, 'mobile', 'app.config.ts'), 'utf8');
const doc = readFileSync(join(root, 'docs', 'store-submission', '01_app_privacy_apple.md'), 'utf8');

const inConfig = [...config.matchAll(/^\s*collected\('(\w+)'(?:, '(\w+)')?\)/gm)].map((m) => ({ type: m[1], purpose: m[2] ?? 'AppFunctionality' }));

// Apple's label (last part of the first column of the table) → manifest key. `null` = collected, but declared under another key.
const KEY_OF_LABEL = {
  'Email Address': 'EmailAddress',
  Name: 'Name',
  'Phone Number': 'PhoneNumber',
  'Payment Info': 'PaymentInfo',
  'Precise Location': 'PreciseLocation',
  'Sensitive Info': 'SensitiveInfo',
  'Emails or Text Messages': null, // → Other User Content
  'Photos or Videos': 'PhotosorVideos',
  'Audio Data': 'AudioData',
  'Customer Support': null, // → Other User Content
  'Other User Content': 'OtherUserContent',
  'User ID': 'UserID',
  'Device ID': 'DeviceID',
  'Purchase History': 'PurchaseHistory',
  'Crash Data': 'CrashData',
  'Performance Data': 'PerformanceData',
  'Other Diagnostic Data': 'OtherDiagnosticData',
  'Other Data Types': 'OtherDataTypes',
};

// Section 1 of the document: | Tipo | ¿Se recoge? | Vinculado | Tracking | Finalidades | Evidencia | En el manifiesto hoy |
const section = doc.slice(doc.indexOf('## 1.'), doc.indexOf('## 2.'));
const rows = section
  .split('\n')
  .filter((line) => line.startsWith('|') && !/^\|[-\s|]+\|$/.test(line))
  .map((line) => line.split('|').slice(1, -1).map((c) => c.replace(/\*\*/g, '').trim()))
  .filter((cells) => cells.length === 7 && cells[0] !== 'Tipo de Apple')
  .map((cells) => ({
    label: cells[0].split('›').pop().trim(),
    collected: cells[1].startsWith('Sí'),
    linked: cells[2],
    tracking: cells[3],
    purpose: cells[4].split(';')[0].replace(/\s*\(.*$/, '').trim(),
    inManifest: cells[6],
  }));
const collectedRows = rows.filter((r) => r.collected);

test('the manifest declares the collected data and wires it into privacyManifests', () => {
  assert.ok(inConfig.length >= 16);
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

test('match gender / interest, the push token and Sentry replay are declared (build 13)', () => {
  for (const type of ['SensitiveInfo', 'DeviceID', 'OtherDiagnosticData']) {
    assert.ok(inConfig.some((d) => d.type === type), `${type} is declared`);
  }
  assert.equal(inConfig.find((d) => d.type === 'OtherDiagnosticData').purpose, 'Analytics');
});

test('the document table is read (every collected row has a known Apple label)', () => {
  assert.ok(rows.length >= 20, `rows read: ${rows.length}`);
  for (const r of collectedRows) assert.ok(r.label in KEY_OF_LABEL, `unknown label in the table: ${r.label}`);
});

test('App Store Connect table (01_app_privacy_apple.md) lists exactly the types of the manifest', () => {
  const fromDoc = collectedRows.map((r) => KEY_OF_LABEL[r.label]).filter(Boolean).sort();
  assert.deepEqual(fromDoc, inConfig.map((d) => d.type).sort());
});

test('every collected row is linked to the account, not tracking, and has the same purpose as the manifest', () => {
  for (const r of collectedRows) {
    assert.equal(r.linked, 'Sí', `${r.label}: linked`);
    assert.equal(r.tracking, 'No', `${r.label}: tracking`);
    const key = KEY_OF_LABEL[r.label];
    if (!key) continue;
    const declared = inConfig.find((d) => d.type === key);
    const purpose = r.purpose === 'Analytics' ? 'Analytics' : 'AppFunctionality';
    assert.equal(declared.purpose, purpose, `${r.label}: purpose`);
  }
});

test('no collected row of the table is still marked as missing in the manifest', () => {
  for (const r of collectedRows) {
    if (KEY_OF_LABEL[r.label] === null) continue;
    assert.doesNotMatch(r.inManifest, /✘|falta/i, `${r.label}: ${r.inManifest}`);
  }
});
