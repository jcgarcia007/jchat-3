// JChat 3.0 — the venue the user was entering survives "register here, confirm the e-mail and sign in in ANOTHER browser".
// The sign-up stores the pending entry in the account (user_metadata.pending_entry); the first authenticated session adopts it and clears it.
// Run: node --test scripts/pending-entry-in-account.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// Same loader as reenter-entry.test.mjs: transpile the pure modules to a temp dir (relative imports get an .mjs extension).
const dir = mkdtempSync(join(tmpdir(), 'pending-entry-'));
for (const name of ['venueQr', 'entryUrl', 'reenterEntry', 'pendingEntryMeta']) {
  const source = readFileSync(new URL(`../utils/${name}.ts`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
  writeFileSync(join(dir, `${name}.mjs`), outputText.replace(/from '\.\/(\w+)'/g, "from './$1.mjs'"));
}
const { entryFromMetadata, metadataForSignUp, validDatedEntry } = await import(pathToFileURL(join(dir, 'pendingEntryMeta.mjs')).href);

const TTL = 2 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;
const table = { kind: 'table', venue: 'bar-x', label: '8', code: 'k3f9' };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('a fresh, well-formed entry is carried by the sign-up and adopted later, with the ORIGINAL scan time', () => {
  const stored = { target: table, savedAt: NOW - 10 * 60 * 1000 };
  const meta = metadataForSignUp(stored, NOW, TTL);
  assert.deepEqual(meta, stored);
  // the user confirms the e-mail 50 minutes later, in another browser
  const adopted = entryFromMetadata(JSON.parse(JSON.stringify(meta)), NOW + 50 * 60 * 1000, TTL);
  assert.deepEqual(adopted, stored);
  assert.equal(adopted.savedAt, stored.savedAt, 'the 2 h expiry keeps counting from the scan, not from the sign-in');
});

test('the expiry is 2 h from the scan: 1 h 59 min is adopted, 2 h 1 min is not', () => {
  const stored = { target: { kind: 'venue', venue: 'bar-x' }, savedAt: NOW };
  assert.ok(entryFromMetadata(stored, NOW + 119 * 60 * 1000, TTL));
  assert.equal(entryFromMetadata(stored, NOW + 121 * 60 * 1000, TTL), null);
});

test('nothing valid → nothing written / adopted (absent, expired at sign-up, malformed, wrong types, future date)', () => {
  assert.equal(metadataForSignUp(null, NOW, TTL), undefined);
  assert.equal(metadataForSignUp({ target: table, savedAt: NOW - TTL - 1 }, NOW, TTL), undefined);
  for (const bad of [undefined, null, 'x', 7, {}, { target: table }, { savedAt: NOW }, { target: { kind: 'nope' }, savedAt: NOW },
    { target: { kind: 'table', venue: 'v' }, savedAt: NOW }, { target: table, savedAt: '1800000000000' }, { target: table, savedAt: NOW + 5000 },
    { target: table, savedAt: Number.NaN }]) {
    assert.equal(entryFromMetadata(bad, NOW, TTL), null, JSON.stringify(bad));
  }
});

test('the other entry kinds (venue, token, tabletoken) round-trip; extra fields in the metadata are dropped', () => {
  for (const target of [{ kind: 'venue', venue: 'bar-x' }, { kind: 'token', token: 'abc123' }, { kind: 'tabletoken', token: 'tt-1', venue: 'bar-x' }]) {
    assert.deepEqual(validDatedEntry({ target, savedAt: NOW, extra: 'x' }, NOW, TTL), { target, savedAt: NOW });
  }
});

test('RegisterStep2Screen reads the pending entry before signUp and sends it as data.pending_entry', () => {
  const src = read('screens/auth/RegisterStep2Screen.tsx');
  assert.match(src, /from '\.\.\/\.\.\/services\/venueEntry'/);
  const iPeek = src.indexOf('peekPendingEntry()');
  const iSignUp = src.indexOf('supabase.auth.signUp(');
  assert.ok(iPeek > 0 && iPeek < iSignUp, 'peekPendingEntry() must run before signUp');
  assert.match(src, /data: \{ full_name: name\.trim\(\) \|\| undefined, pending_profile: pendingProfile, pending_entry: pendingEntry \}/);
});

test('AuthContext adopts user_metadata.pending_entry BEFORE the pending_profile branch (which returns early) and clears it', () => {
  const src = read('context/AuthContext.tsx');
  const iEntry = src.indexOf('user_metadata?.pending_entry');
  const iProfile = src.indexOf('user_metadata?.pending_profile');
  assert.ok(iEntry > 0 && iEntry < iProfile, 'the entry must be handled before the early return of pending_profile');
  const block = src.slice(iEntry, iProfile);
  assert.match(block, /adoptMetadataEntry\(metaEntry\)/);
  assert.match(block, /updateUser\(\{ data: \{ pending_entry: null \} \}\)/);
});

test('venueEntry: a pending entry already in THIS browser wins; the adopted one keeps the original savedAt; nothing is logged', () => {
  const src = read('services/venueEntry.ts');
  const fn = src.slice(src.indexOf('export async function adoptMetadataEntry'), src.indexOf('export async function clearPendingEntry'));
  assert.match(fn, /entryFromMetadata\(meta, now, PENDING_ENTRY_TTL_MS\)/);
  assert.ok(fn.indexOf('peekPendingEntry') < fn.indexOf('savePendingEntry'), 'local entry is checked before saving');
  assert.match(fn, /savePendingEntry\(entry\.target, entry\.savedAt\)/);
  assert.doesNotMatch(src + read('utils/pendingEntryMeta.ts'), /console\.(log|warn|error)\([^)]*(target|entry)/i);
});
