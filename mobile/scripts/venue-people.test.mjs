// Unit tests for utils/venuePeople.ts (ids sent to venue_people_counts and how its answer is read).
// Run from mobile/:  node --test scripts/venue-people.test.mjs
// The module is TypeScript: it is transpiled with the repo's own `typescript` into a temp dir and imported.

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'venue-people-'));
const source = readFileSync(new URL('../utils/venuePeople.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
writeFileSync(join(dir, 'venuePeople.mjs'), outputText);
const { limitCountIds, parsePeopleCounts, MAX_COUNT_IDS } = await import(pathToFileURL(join(dir, 'venuePeople.mjs')).href);

test('the server is asked for at most 200 venues', () => {
  assert.equal(MAX_COUNT_IDS, 200);
  const many = Array.from({ length: 450 }, (_, i) => `id-${i}`);
  const ids = limitCountIds(many);
  assert.equal(ids.length, 200);
  assert.equal(ids[0], 'id-0');
  assert.equal(ids[199], 'id-199');
});

test('empty, repeated and non-text ids are not sent; the order is kept', () => {
  assert.deepEqual(limitCountIds(['b', '', 'a', 'b', null, undefined, 'c', 'a']), ['b', 'a', 'c']);
  assert.deepEqual(limitCountIds([]), []);
});

test('the answer becomes a { business_id: people } map', () => {
  assert.deepEqual(parsePeopleCounts([{ business_id: 'a', people: 3 }, { business_id: 'b', people: 12 }]), { a: 3, b: 12 });
});

test('a venue missing from the answer is simply absent (the caller uses 0)', () => {
  const counts = parsePeopleCounts([{ business_id: 'a', people: 3 }]);
  assert.equal(counts.b, undefined);
  assert.equal(counts.b ?? 0, 0);
});

test('a malformed answer never throws and gives an empty map', () => {
  assert.deepEqual(parsePeopleCounts(null), {});
  assert.deepEqual(parsePeopleCounts(undefined), {});
  assert.deepEqual(parsePeopleCounts('boom'), {});
  assert.deepEqual(parsePeopleCounts({ business_id: 'a', people: 1 }), {});
});

test('bad rows are dropped, good ones kept; counts are whole numbers ≥ 0', () => {
  const counts = parsePeopleCounts([
    { business_id: 'a', people: 4 },
    { business_id: 'b', people: -2 },
    { business_id: 'c', people: 'x' },
    { business_id: '', people: 5 },
    { people: 7 },
    null,
    { business_id: 'd', people: '9' },
    { business_id: 'e', people: 2.9 },
  ]);
  assert.deepEqual(counts, { a: 4, d: 9, e: 2 });
});

test('the answer carries no user identifiers: only the venue and a number are read', () => {
  const counts = parsePeopleCounts([{ business_id: 'a', people: 2, user_id: 'secret', user_ids: ['x'] }]);
  assert.deepEqual(counts, { a: 2 });
  assert.equal(JSON.stringify(counts).includes('secret'), false);
});
