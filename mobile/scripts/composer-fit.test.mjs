// Unit tests for utils/composerFit.ts (the size of the message box of the chat composers on the web).
// Run from mobile/:  node --test scripts/composer-fit.test.mjs
// The module is TypeScript: it is transpiled with the repo's own `typescript` into a temp dir and imported.

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'composer-fit-'));
const source = readFileSync(new URL('../utils/composerFit.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
writeFileSync(join(dir, 'composerFit.mjs'), outputText);
const { composerPadding, composerHeight } = await import(pathToFileURL(join(dir, 'composerFit.mjs')).href);

// The venue chat: round buttons 44, line 20, border 1, maximum 120 (the style's maxHeight).
const CHAT = { minHeight: 44, maxHeight: 120, lineHeight: 20, borderWidth: 1 };

test('venue chat: 11 px of vertical padding makes one line + borders exactly 44', () => {
  const padding = composerPadding(CHAT);
  assert.equal(padding, 11);
  assert.equal(2 * padding + CHAT.lineHeight + 2 * CHAT.borderWidth, CHAT.minHeight);
});

test('DMs: padding 9, line 20, 1 px borders → the minimum is 40 and the padding comes back as 9', () => {
  const dm = { minHeight: 2 * 9 + 20 + 2 * 1, maxHeight: 120, lineHeight: 20, borderWidth: 1 };
  assert.equal(composerPadding(dm), 9);
});

test('a minimum smaller than the line never gives negative padding', () => {
  assert.equal(composerPadding({ minHeight: 10, lineHeight: 20, borderWidth: 1 }), 0);
});

test('empty or one line: the box is the minimum (the textarea content is one 20 px line + 22 padding)', () => {
  assert.deepEqual(composerHeight(42, 2, CHAT), { height: 44, scrolls: false });
  assert.deepEqual(composerHeight(0, 2, CHAT), { height: 44, scrolls: false }); // never under the minimum
});

test('the box grows one line at a time', () => {
  assert.deepEqual(composerHeight(62, 2, CHAT), { height: 64, scrolls: false }); // 2 lines
  assert.deepEqual(composerHeight(82, 2, CHAT), { height: 84, scrolls: false }); // 3 lines
  assert.deepEqual(composerHeight(102, 2, CHAT), { height: 104, scrolls: false }); // 4 lines
});

test('five lines pass the maximum: the box stops at 120 and scrolls inside', () => {
  assert.deepEqual(composerHeight(122, 2, CHAT), { height: 120, scrolls: true });
  assert.deepEqual(composerHeight(900, 2, CHAT), { height: 120, scrolls: true });
});

test('exactly at the maximum it does not scroll', () => {
  assert.deepEqual(composerHeight(118, 2, CHAT), { height: 120, scrolls: false });
});

// ── Native (iOS / Android) must not change: the composers spread the result of the native hook on their TextInput. ──
const nativeSource = readFileSync(new URL('../hooks/useComposerFit.ts', import.meta.url), 'utf8');
const nativeOut = ts.transpileModule(nativeSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
writeFileSync(join(dir, 'useComposerFit.native.mjs'), nativeOut);
const { useComposerFit: nativeFit } = await import(pathToFileURL(join(dir, 'useComposerFit.native.mjs')).href);

test('native hook: no style and no props, whatever the options (the TextInput renders exactly as before)', () => {
  const a = nativeFit({ current: null }, '', CHAT);
  assert.equal(a.style, undefined);
  assert.deepEqual(a.inputProps, {});
  assert.deepEqual({ ...a.inputProps }, {}); // spread on <TextInput {...fit.inputProps}> adds nothing
  assert.equal(nativeFit({ current: null }, 'more text', { ...CHAT, minHeight: 99 }), a, 'the same constant every time (no re-render churn)');
});

test('native hook: no effects or other imports (it never touches the DOM)', () => {
  assert.doesNotMatch(nativeOut, /useLayoutEffect|useEffect|document|window|ResizeObserver/);
  assert.doesNotMatch(nativeOut, /^import /m); // only type imports in the source: erased
});
