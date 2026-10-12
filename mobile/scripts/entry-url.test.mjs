// Unit tests for utils/entryUrl.ts (QR → venue entry parser). Run from mobile/:
//   node --test scripts/entry-url.test.mjs
// The parser is TypeScript: it is transpiled with the repo's own `typescript` into a temp dir and imported.

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'entry-url-'));
for (const name of ['venueQr', 'entryUrl']) {
  const source = readFileSync(new URL(`../utils/${name}.ts`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
  writeFileSync(join(dir, `${name}.mjs`), outputText.replace("from './venueQr'", "from './venueQr.mjs'"));
}
const { parseEntryUrl, shouldLinkingHandle, RESERVED_VENUE_SUBDOMAINS } = await import(pathToFileURL(join(dir, 'entryUrl.mjs')).href);

const VENUE = 'bar-xzx-omd2';
const TOKEN = 'AbC123_-xyz';
const WEB = { allowVenueQuery: true };

const cases = [
  // ── valid formats ──────────────────────────────────────────────────────────
  ['venue root', `https://${VENUE}.jchat.cloud/`, undefined, { kind: 'venue', venue: VENUE }],
  ['venue root without slash', `https://${VENUE}.jchat.cloud`, undefined, { kind: 'venue', venue: VENUE }],
  ['host in uppercase', `https://${VENUE.toUpperCase()}.JCHAT.CLOUD/`, undefined, { kind: 'venue', venue: VENUE }],
  ['query and hash ignored', `https://${VENUE}.jchat.cloud/?utm=x#top`, undefined, { kind: 'venue', venue: VENUE }],
  ['table', `https://${VENUE}.jchat.cloud/8-k3f9`, undefined, { kind: 'table', venue: VENUE, label: '8', code: 'k3f9' }],
  ['table with trailing slash', `https://${VENUE}.jchat.cloud/8-k3f9/`, undefined, { kind: 'table', venue: VENUE, label: '8', code: 'k3f9' }],
  ['table in uppercase', `https://${VENUE}.jchat.cloud/8-K3F9`, undefined, { kind: 'table', venue: VENUE, label: '8', code: 'k3f9' }],
  ['table with letter label and query', `https://${VENUE}.jchat.cloud/t8-k3f9?x=1#y`, undefined, { kind: 'table', venue: VENUE, label: 't8', code: 'k3f9' }],
  ['table with an 8-char code', `https://${VENUE}.jchat.cloud/12-k3f9m4pq`, undefined, { kind: 'table', venue: VENUE, label: '12', code: 'k3f9m4pq' }],
  ['token on the apex', `https://jchat.cloud/c/${TOKEN}`, undefined, { kind: 'token', token: TOKEN }],
  ['token on the apex with trailing slash and query', `https://jchat.cloud/c/${TOKEN}/?a=1`, undefined, { kind: 'token', token: TOKEN }],
  ['token on a venue subdomain', `https://${VENUE}.jchat.cloud/c/${TOKEN}`, undefined, { kind: 'token', token: TOKEN, venue: VENUE }],
  ['token keeps its case', 'https://jchat.cloud/c/ABCdef', undefined, { kind: 'token', token: 'ABCdef' }],
  ['scheme: token', `jchat://c/${TOKEN}`, undefined, { kind: 'token', token: TOKEN }],
  ['scheme: venue', `jchat://v/${VENUE}`, undefined, { kind: 'venue', venue: VENUE }],
  ['scheme: venue with trailing slash', `jchat://v/${VENUE}/`, undefined, { kind: 'venue', venue: VENUE }],
  ['scheme: table', `jchat://v/${VENUE}/8-k3f9`, undefined, { kind: 'table', venue: VENUE, label: '8', code: 'k3f9' }],
  ['surrounding whitespace', `  https://${VENUE}.jchat.cloud/  `, undefined, { kind: 'venue', venue: VENUE }],
  // ── not entries ────────────────────────────────────────────────────────────
  ['apex root', 'https://jchat.cloud/', undefined, null],
  ['apex dashboard', 'https://jchat.cloud/dashboard', undefined, null],
  ['apex table-like path', 'https://jchat.cloud/8-k3f9', undefined, null],
  ['reserved: www', 'https://www.jchat.cloud/', undefined, null],
  ['reserved: app', 'https://app.jchat.cloud/8-k3f9', undefined, null],
  ['reserved: c', 'https://c.jchat.cloud/', undefined, null],
  ['reserved: otunity', 'https://otunity.jchat.cloud/', undefined, null],
  ['reserved in the scheme form', 'jchat://v/www', undefined, null],
  ['table code outside the alphabet (l)', `https://${VENUE}.jchat.cloud/8-k3l9`, undefined, null],
  ['table code outside the alphabet (0, 1, o, i)', `https://${VENUE}.jchat.cloud/8-k0o1`, undefined, null],
  ['table code too short', `https://${VENUE}.jchat.cloud/8-k3f`, undefined, null],
  ['table label too long', `https://${VENUE}.jchat.cloud/123456789-k3f9`, undefined, null],
  ['token too short', 'https://jchat.cloud/c/abc', undefined, null],
  ['token with a bad character', 'https://jchat.cloud/c/abc$def', undefined, null],
  ['scheme: room/:id is not an entry', 'jchat://room/123e4567', undefined, null],
  ['scheme: post/:id is not an entry', 'jchat://post/abc123', undefined, null],
  ['scheme: confirm (auth) is not an entry', 'jchat://confirm?token_hash=abc&type=signup', undefined, null],
  ['scheme: empty venue', 'jchat://v/', undefined, null],
  ['scheme: token with extra path', `jchat://c/${TOKEN}/extra`, undefined, null],
  ['foreign host', `https://evil.com/c/${TOKEN}`, undefined, null],
  ['look-alike suffix', `https://${VENUE}.jchat.cloud.evil.com/`, undefined, null],
  ['look-alike without the dot', 'https://fakejchat.cloud/c/abcdef', undefined, null],
  ['two-level subdomain', 'https://a.b.jchat.cloud/', undefined, null],
  ['userinfo trick', `https://${VENUE}.jchat.cloud@evil.com/`, undefined, null],
  ['http on jchat.cloud', `http://${VENUE}.jchat.cloud/`, undefined, null],
  ['unknown path on a venue host', `https://${VENUE}.jchat.cloud/menu`, undefined, null],
  ['empty string', '', undefined, null],
  ['not a URL', 'hello world', undefined, null],
  // ── ?venue= (web testing aid) ──────────────────────────────────────────────
  ['?venue= on *.jchat.cloud is ignored', `https://${VENUE}.jchat.cloud/?venue=other`, WEB, { kind: 'venue', venue: VENUE }],
  ['?venue= on *.jchat.cloud ignored: table keeps the host venue', `https://${VENUE}.jchat.cloud/8-k3f9?venue=other`, WEB, { kind: 'table', venue: VENUE, label: '8', code: 'k3f9' }],
  ['?venue= on the apex is ignored', `https://jchat.cloud/?venue=${VENUE}`, WEB, null],
  ['vercel.app with ?venue= WITHOUT the option', `https://jchat-app-web-git-x.vercel.app/?venue=${VENUE}`, undefined, null],
  ['vercel.app with ?venue= and the option', `https://jchat-app-web-git-x.vercel.app/?venue=${VENUE}`, WEB, { kind: 'venue', venue: VENUE }],
  ['option: table path', `https://x.vercel.app/8-zzzz?venue=${VENUE}`, WEB, { kind: 'table', venue: VENUE, label: '8', code: 'zzzz' }],
  ['option: token path with venue', `https://x.vercel.app/c/${TOKEN}?venue=${VENUE}`, WEB, { kind: 'token', token: TOKEN, venue: VENUE }],
  ['option: token path without venue', `https://x.vercel.app/c/${TOKEN}`, WEB, { kind: 'token', token: TOKEN }],
  ['option: venue is lower-cased', 'https://x.vercel.app/?venue=BAR-XZX-OMD2', WEB, { kind: 'venue', venue: VENUE }],
  ['option: reserved venue', 'https://x.vercel.app/?venue=www', WEB, null],
  ['option: missing venue on the root', 'https://x.vercel.app/', WEB, null],
  ['option: localhost over http', `http://localhost:8081/?venue=${VENUE}`, WEB, { kind: 'venue', venue: VENUE }],
  ['http localhost WITHOUT the option', `http://localhost:8081/?venue=${VENUE}`, undefined, null],
];

for (const [name, raw, opts, expected] of cases) {
  test(name, () => {
    assert.deepEqual(parseEntryUrl(raw, opts), expected);
  });
}

test('reserved list matches migration 199 (26 names)', () => {
  assert.equal(RESERVED_VENUE_SUBDOMAINS.length, 26);
  assert.ok(RESERVED_VENUE_SUBDOMAINS.includes('otunity') && RESERVED_VENUE_SUBDOMAINS.includes('www'));
});

// ── linking `filter` (navigation/AppNavigator.tsx): false = React Navigation must not try to open it ──────────

const filterCases = [
  ['filter: scheme venue entry is not a screen', `jchat://v/${VENUE}`, false],
  ['filter: scheme table entry is not a screen', `jchat://v/${VENUE}/8-k3f9`, false],
  ['filter: scheme token entry is not a screen', `jchat://c/${TOKEN}`, false],
  ['filter: https venue entry', `https://${VENUE}.jchat.cloud/`, false],
  ['filter: apex token entry', `https://jchat.cloud/c/${TOKEN}`, false],
  ['filter: room/:id still goes to linking', 'jchat://room/123e4567-e89b-12d3-a456-426614174000', true],
  ['filter: post/:postId still goes to linking', 'jchat://post/abc123', true],
  ['filter: confirm (auth) is left alone', 'jchat://confirm?token_hash=abc&type=signup', true],
  ['filter: unknown reserved venue is not an entry, so linking keeps its behaviour', 'jchat://v/www', true],
  ['filter: an unrelated URL', 'https://example.com/x', true],
];
for (const [name, url, expected] of filterCases) {
  test(name, () => {
    assert.equal(shouldLinkingHandle(url), expected);
  });
}
