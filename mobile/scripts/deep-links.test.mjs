// Deep-link parsing (jchat://room/:id, jchat://post/:postId) against the installed @react-navigation/core.
// Guards the dependency update that dropped query-string (core 7.24): same paths, same params, query strings still parsed.
//   node --test scripts/deep-links.test.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getStateFromPath } from '@react-navigation/core';

const config = { screens: { ChatRoom: 'room/:id', PostDetail: 'post/:postId' } };
const route = (path) => getStateFromPath(path, config)?.routes?.[0];

test('AppNavigator still declares this linking config', () => {
  const src = readFileSync(new URL('../navigation/AppNavigator.tsx', import.meta.url), 'utf8');
  assert.match(src, /prefixes: \['jchat:\/\/'\]/);
  assert.match(src, /ChatRoom: 'room\/:id'/);
  assert.match(src, /PostDetail: 'post\/:postId'/);
});

test('room and post paths resolve to their screens with params', () => {
  assert.deepEqual(route('room/abc-123'), { name: 'ChatRoom', params: { id: 'abc-123' }, path: 'room/abc-123' });
  assert.equal(route('post/42').name, 'PostDetail');
  assert.equal(route('post/42').params.postId, '42');
});

test('query strings are parsed into params (the code path that used query-string)', () => {
  const r = route('room/abc?table=T%201&x=a%2Bb');
  assert.equal(r.name, 'ChatRoom');
  assert.equal(r.params.id, 'abc');
  assert.equal(r.params.table, 'T 1');
  assert.equal(r.params.x, 'a+b');
});

test('unknown paths do not resolve', () => {
  assert.equal(getStateFromPath('nope/1', config), undefined);
});
