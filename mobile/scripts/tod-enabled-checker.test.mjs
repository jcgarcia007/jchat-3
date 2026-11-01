// Truth or Dare's "is it on at this venue?" check: its own call apart from Match's, asked again on focus and when the app returns to the foreground,
// one request at a time, late answers dropped. Run from mobile/:  node --test scripts/tod-enabled-checker.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const js = ts.transpileModule(read('utils/todEnabledChecker.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', js)(mod, mod.exports);
const { createEnabledChecker } = mod.exports;

/** A check whose answers the test releases by hand. */
function manualCheck() {
  const calls = [];
  const check = (businessId) => new Promise((resolve, reject) => calls.push({ businessId, resolve, reject }));
  return { check, calls };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('the first refresh asks the server and applies the answer', async () => {
  const { check, calls } = manualCheck();
  const applied = [];
  const checker = createEnabledChecker(check, (v) => applied.push(v));
  const done = checker.refresh('biz');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].businessId, 'biz');
  calls[0].resolve(true);
  await done;
  assert.deepEqual(applied, [true]);
});

test('only ONE request in flight: refreshes while one is out (focus + foreground together) make no second request', async () => {
  const { check, calls } = manualCheck();
  const applied = [];
  const checker = createEnabledChecker(check, (v) => applied.push(v));
  const first = checker.refresh('biz');
  void checker.refresh('biz');
  void checker.refresh('biz');
  await flush();
  assert.equal(calls.length, 1, 'no burst');
  calls[0].resolve(true);
  await first;
  assert.deepEqual(applied, [true], 'applied once');
  // once it is done, a new refresh asks again (the owner may have changed the switch meanwhile)
  const again = checker.refresh('biz');
  assert.equal(calls.length, 2);
  calls[1].resolve(false);
  await again;
  assert.deepEqual(applied, [true, false]);
});

test('an answer that arrives after dispose (the screen is gone) is dropped', async () => {
  const { check, calls } = manualCheck();
  const applied = [];
  const checker = createEnabledChecker(check, (v) => applied.push(v));
  const done = checker.refresh('biz');
  checker.dispose();
  calls[0].resolve(true);
  await done;
  assert.deepEqual(applied, []);
  await checker.refresh('biz');
  assert.equal(calls.length, 1, 'a disposed checker asks nothing');
});

test('an answer for a venue we have left is dropped, and the new venue is asked next (still one at a time)', async () => {
  const { check, calls } = manualCheck();
  const applied = [];
  const checker = createEnabledChecker(check, (v) => applied.push(v));
  const done = checker.refresh('old');
  void checker.refresh('new');
  await flush();
  assert.equal(calls.length, 1, 'the second venue waits for the first request');
  calls[0].resolve(true); // the old venue's answer: dropped
  await flush();
  assert.deepEqual(applied, []);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].businessId, 'new');
  calls[1].resolve(false);
  await done;
  assert.deepEqual(applied, [false]);
});

test('a request that throws keeps what was known and the next refresh works', async () => {
  const { check, calls } = manualCheck();
  const applied = [];
  const checker = createEnabledChecker(check, (v) => applied.push(v));
  const first = checker.refresh('biz');
  calls[0].reject(new Error('network'));
  await first;
  assert.deepEqual(applied, [], 'nothing applied: the previous value stays');
  const second = checker.refresh('biz');
  calls[1].resolve(true);
  await second;
  assert.deepEqual(applied, [true]);
});

test('no venue (not loaded yet) asks nothing', async () => {
  const { check, calls } = manualCheck();
  const checker = createEnabledChecker(check, () => undefined);
  await checker.refresh(null);
  await checker.refresh(undefined);
  assert.equal(calls.length, 0);
});

// ── Static checks on the chat ──────────────────────────────────────────────────

const chat = read('screens/chat/ChatRoomScreen.tsx');

test('TOD is no longer inside the Promise.all of Match: a failure of the other calls cannot switch it off', () => {
  const all = chat.slice(chat.indexOf('void Promise.all(['), chat.indexOf('      alive = false;\n    };\n  }, [matchBusinessId, user?.id]);'));
  assert.doesNotMatch(all, /isTodEnabledForBusiness/);
  assert.doesNotMatch(all, /setTodAvailable/);
  assert.match(all, /isMatchEnabledForBusiness\(matchBusinessId\)/, 'Match keeps its own calls');
});

test('the chat asks again on focus and when the app returns to the foreground, through the checker; nothing else is re-asked', () => {
  assert.match(chat, /createEnabledChecker\(isTodEnabledForBusiness, setTodAvailable\)/);
  assert.match(chat, /AppState\.addEventListener\('change', \(state\) => \{\s*if \(state === 'active'\) void checker\.refresh\(matchBusinessId\);/);
  assert.match(chat, /useFocusEffect\(\s*useCallback\(\(\) => \{\s*void todCheckerRef\.current\?\.refresh\(matchBusinessId\);/);
  assert.match(chat, /subscription\.remove\(\);\s*checker\.dispose\(\);/, 'cleanup on unmount');
  assert.equal((chat.match(/isTodEnabledForBusiness\(/g) ?? []).length, 0, 'only the checker calls it');
});

test('the other conditions are unchanged (owner, the user\'s own switch, the games.truth_or_dare row)', () => {
  assert.match(chat, /const todActive = todAvailable && gamesEnabled;/);
  assert.match(chat, /const gamesAvailable = \(matchActive \|\| todActive\) && !isOwner;/);
  assert.match(chat, /g\.key === 'truth_or_dare' && todActive/);
});
