// Unit tests for utils/reenterEntry.ts (which venue entry the web offers to re-enter). Run from mobile/:
//   node --test scripts/reenter-entry.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'reenter-'));
for (const name of ['venueQr', 'entryUrl', 'reenterEntry']) {
  const source = readFileSync(new URL(`../utils/${name}.ts`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
  writeFileSync(join(dir, `${name}.mjs`), outputText.replace("from './venueQr'", "from './venueQr.mjs'").replace("from './entryUrl'", "from './entryUrl.mjs'"));
}
const { chooseEntryToOffer, describeOffer, rememberEntry, recallEntry, resetRememberedEntryForTests, isEntryTarget } = await import(pathToFileURL(join(dir, 'reenterEntry.mjs')).href);

const TABLE = { kind: 'table', venue: 'bar-xzx-omd2', label: '8', code: 'k3f9' };
const VENUE = { kind: 'venue', venue: 'bar-xzx-omd2' };
const fakeStore = (initial = {}) => {
  const data = { ...initial };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v; }, data };
};

test('remembered > derived from the host > nothing', () => {
  const host = 'https://other-bar.jchat.cloud/';
  assert.deepEqual(chooseEntryToOffer({ remembered: TABLE, href: host }), TABLE, 'remembered wins over the host');
  assert.deepEqual(chooseEntryToOffer({ remembered: null, href: host }), { kind: 'venue', venue: 'other-bar' }, 'host derives the venue');
  assert.deepEqual(chooseEntryToOffer({ remembered: null, href: 'https://bar-xzx-omd2.jchat.cloud/8-k3f9' }), TABLE, 'a table path on the host keeps the table target');
  assert.equal(chooseEntryToOffer({ remembered: null, href: 'https://jchat.cloud/' }), null, 'apex: no venue');
  assert.equal(chooseEntryToOffer({ remembered: null, href: 'https://app.jchat.cloud/' }), null, 'reserved subdomain is not a venue');
  assert.equal(chooseEntryToOffer({ remembered: null, href: 'http://localhost:8081/?venue=bar-xzx-omd2' }), null, 'a ?venue= query is a QR-capture aid, never derived here');
  assert.equal(chooseEntryToOffer({ remembered: null, href: null }), null);
  assert.equal(chooseEntryToOffer({ remembered: null, href: undefined }), null);
});

test('the offer text carries names only: never the table label, code or token', () => {
  for (const target of [TABLE, { kind: 'token', token: 'AbC123_-xyz', venue: 'bar-xzx-omd2' }, VENUE]) {
    const shown = JSON.stringify(describeOffer(target, { resolved: 'Bar XZX' }));
    assert.equal(shown, '{"businessName":"Bar XZX"}');
    for (const secret of ['k3f9', 'AbC123_-xyz', '"8"']) assert.ok(!shown.includes(secret), secret);
  }
  assert.deepEqual(describeOffer(TABLE, {}), { businessName: null }, 'unresolved name → generic text');
  assert.deepEqual(describeOffer(TABLE, { resolved: '  ' }), { businessName: null });
  assert.deepEqual(describeOffer(TABLE, { resolved: 'Bar XZX', left: ' Bar Viejo ' }), { businessName: 'Bar Viejo' }, 'the venue just left wins');
});

test('remembering the last entry: tab store round trip, memory fallback, broken storage', () => {
  resetRememberedEntryForTests();
  assert.equal(recallEntry(fakeStore()), null);

  const store = fakeStore();
  rememberEntry(TABLE, store);
  assert.deepEqual(JSON.parse(store.data['jchat.lastEntry.v1']), TABLE);
  assert.deepEqual(recallEntry(store), TABLE);

  // a fresh page load (memory gone) in the same tab still has it through the store
  resetRememberedEntryForTests();
  assert.deepEqual(recallEntry(store), TABLE);

  // the last one wins
  rememberEntry(VENUE, store);
  assert.deepEqual(recallEntry(store), VENUE);

  // storage that throws → memory only, nothing breaks
  resetRememberedEntryForTests();
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  rememberEntry(TABLE, broken);
  assert.deepEqual(recallEntry(broken), TABLE);

  // no store at all
  resetRememberedEntryForTests();
  rememberEntry(VENUE, null);
  assert.deepEqual(recallEntry(null), VENUE);
});

test('a corrupted or foreign stored value is ignored', () => {
  resetRememberedEntryForTests();
  for (const raw of ['not json', '{"kind":"table","venue":"x"}', '{"kind":"evil"}', 'null', '[]', '"venue"']) {
    assert.equal(recallEntry(fakeStore({ 'jchat.lastEntry.v1': raw })), null, raw);
  }
  assert.equal(isEntryTarget({ kind: 'token', token: 't' }), true);
  assert.equal(isEntryTarget({ kind: 'token', token: 5 }), false);
  assert.equal(isEntryTarget({ kind: 'tabletoken', token: 't' }), true);
  assert.equal(isEntryTarget({ kind: 'tabletoken', token: 't', venue: 'v' }), true);
  assert.equal(isEntryTarget({ kind: 'tabletoken', token: 5 }), false);
});
