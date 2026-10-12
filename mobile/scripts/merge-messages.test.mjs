// Unit tests for utils/mergeMessages.ts (catch-up after a Realtime gap). Run from mobile/:
//   node --test scripts/merge-messages.test.mjs
// The module is TypeScript: it is transpiled with the repo's own `typescript` into a temp dir and imported.

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'merge-messages-'));
const out = (name) => join(dir, `${name}.mjs`);
for (const name of ['mergeMessages', 'channelBackoff']) {
  const source = readFileSync(new URL(`../utils/${name}.ts`, import.meta.url), 'utf8');
  writeFileSync(out(name), ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
}
const { mergeMessages, newestConfirmedTimestamp, resyncHasGap, OPTIMISTIC_ID_PREFIX } = await import(pathToFileURL(out('mergeMessages')).href);
const { channelBackoffMs, MAX_CHANNEL_BACKOFF_MS } = await import(pathToFileURL(out('channelBackoff')).href);

const m = (id, created_at, extra = {}) => ({ id, created_at, ...extra });
const ids = (list) => list.map((x) => x.id);

// ── mergeMessages ────────────────────────────────────────────────────────────────────────────────────

test('adds the missed rows on top, newest first', () => {
  const current = [m('b', '2026-10-11T10:00:02+00:00'), m('a', '2026-10-11T10:00:01+00:00')];
  const incoming = [m('d', '2026-10-11T10:00:04+00:00'), m('c', '2026-10-11T10:00:03+00:00')];
  assert.deepEqual(ids(mergeMessages(current, incoming)), ['d', 'c', 'b', 'a']);
});

test('dedupes by id: a row in both lists appears once', () => {
  const current = [m('b', '2026-10-11T10:00:02+00:00'), m('a', '2026-10-11T10:00:01+00:00')];
  const incoming = [m('c', '2026-10-11T10:00:03+00:00'), m('b', '2026-10-11T10:00:02+00:00')];
  const merged = mergeMessages(current, incoming);
  assert.deepEqual(ids(merged), ['c', 'b', 'a']);
});

test('merging the same rows twice changes nothing (idempotent)', () => {
  const current = [m('b', '2026-10-11T10:00:02+00:00'), m('a', '2026-10-11T10:00:01+00:00')];
  const incoming = [m('c', '2026-10-11T10:00:03+00:00')];
  const once = mergeMessages(current, incoming);
  assert.deepEqual(mergeMessages(once, incoming), once);
});

test('incoming fields win, but a field the incoming row lacks keeps its value (resolved sender name)', () => {
  const current = [m('a', '2026-10-11T10:00:01+00:00', { sender_name: 'Ana', body: 'old' })];
  const incoming = [m('a', '2026-10-11T10:00:01+00:00', { sender_name: undefined, body: 'edited' })];
  const [row] = mergeMessages(current, incoming);
  assert.equal(row.sender_name, 'Ana');
  assert.equal(row.body, 'edited');
});

test('older pages already loaded stay (the catch-up only brings newer rows)', () => {
  const current = [m('c', '2026-10-11T10:00:03+00:00'), m('b', '2026-10-11T10:00:02+00:00'), m('a', '2026-10-11T10:00:01+00:00')];
  assert.deepEqual(ids(mergeMessages(current, [m('d', '2026-10-11T10:00:04+00:00')])), ['d', 'c', 'b', 'a']);
});

test('arrival order does not matter: a late old row is placed by created_at', () => {
  const current = [m('c', '2026-10-11T10:00:03+00:00'), m('a', '2026-10-11T10:00:01+00:00')];
  assert.deepEqual(ids(mergeMessages(current, [m('b', '2026-10-11T10:00:02+00:00')])), ['c', 'b', 'a']);
});

test('timestamps with different formats / offsets are compared as instants', () => {
  const current = [m('a', '2026-10-11T10:00:01.000000+00:00')];
  const incoming = [m('b', '2026-10-11T06:00:02-04:00')]; // 10:00:02 UTC
  assert.deepEqual(ids(mergeMessages(current, incoming)), ['b', 'a']);
});

test('same instant: the later id goes first, deterministically', () => {
  const t = '2026-10-11T10:00:01+00:00';
  assert.deepEqual(ids(mergeMessages([m('a', t)], [m('b', t)])), ['b', 'a']);
  assert.deepEqual(ids(mergeMessages([m('b', t)], [m('a', t)])), ['b', 'a']);
});

test('empty inputs', () => {
  assert.deepEqual(mergeMessages([], []), []);
  assert.deepEqual(ids(mergeMessages([], [m('a', '2026-10-11T10:00:01+00:00')])), ['a']);
  assert.deepEqual(ids(mergeMessages([m('a', '2026-10-11T10:00:01+00:00')], [])), ['a']);
});

test('does not mutate its inputs', () => {
  const current = Object.freeze([m('a', '2026-10-11T10:00:01+00:00')]);
  const incoming = Object.freeze([m('b', '2026-10-11T10:00:02+00:00')]);
  assert.doesNotThrow(() => mergeMessages(current, incoming));
});

test('an optimistic bubble stays until the confirmed row replaces it elsewhere', () => {
  const current = [m(`${OPTIMISTIC_ID_PREFIX}1`, '2026-10-11T10:00:05+00:00'), m('a', '2026-10-11T10:00:01+00:00')];
  const merged = mergeMessages(current, [m('b', '2026-10-11T10:00:03+00:00')]);
  assert.deepEqual(ids(merged), [`${OPTIMISTIC_ID_PREFIX}1`, 'b', 'a']);
});

// ── newestConfirmedTimestamp ─────────────────────────────────────────────────────────────────────────

test('newestConfirmedTimestamp skips optimistic bubbles (device clock) and returns the server row', () => {
  const list = [m(`${OPTIMISTIC_ID_PREFIX}9`, '2026-10-11T10:00:09+00:00'), m('b', '2026-10-11T10:00:02+00:00'), m('a', '2026-10-11T10:00:01+00:00')];
  assert.equal(newestConfirmedTimestamp(list), '2026-10-11T10:00:02+00:00');
});

test('newestConfirmedTimestamp: null when nothing is confirmed', () => {
  assert.equal(newestConfirmedTimestamp([]), null);
  assert.equal(newestConfirmedTimestamp([m(`${OPTIMISTIC_ID_PREFIX}1`, '2026-10-11T10:00:09+00:00')]), null);
});

// ── channelBackoffMs ─────────────────────────────────────────────────────────────────────────────────

test('backoff: 1 s, 2 s, 5 s, 10 s, then 30 s', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(channelBackoffMs), [1000, 2000, 5000, 10000, 30000]);
});

test('backoff never exceeds 30 s and tolerates odd input', () => {
  assert.equal(channelBackoffMs(5), 30000);
  assert.equal(channelBackoffMs(50), 30000);
  assert.ok(channelBackoffMs(1e9) <= MAX_CHANNEL_BACKOFF_MS);
  assert.equal(channelBackoffMs(-3), 1000);
  assert.equal(channelBackoffMs(1.9), 2000);
});

// ── resyncHasGap ─────────────────────────────────────────────────────────────────────────────────────

test('resync: a full result (limit rows or more) means a possible gap → reload the first page', () => {
  assert.equal(resyncHasGap(100, 100), true);
  assert.equal(resyncHasGap(101, 100), true);
});

test('resync: fewer rows than the limit is the whole gap → merge', () => {
  assert.equal(resyncHasGap(99, 100), false);
  assert.equal(resyncHasGap(0, 100), false);
});
