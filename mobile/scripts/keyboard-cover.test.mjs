// Chrome for iPhone: its bottom toolbar makes the visual viewport ~90 px shorter than the layout viewport with NO keyboard. That is not a
// keyboard: useKeyboardCover must answer 0 for it, and the accept sheet must keep its confirm button outside the scroll on the web.
// Run from mobile/:  node --test scripts/keyboard-cover.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'keyboard-cover-'));
writeFileSync(join(dir, 'keyboardCover.mjs'), ts.transpileModule(read('utils/keyboardCover.ts'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
const { keyboardCover, KEYBOARD_MIN_COVER_PX } = await import(pathToFileURL(join(dir, 'keyboardCover.mjs')).href);

test('Safari without a keyboard (both heights equal) and Chrome iOS with its toolbar (80-100 px shorter) are NOT a keyboard: 0', () => {
  assert.equal(KEYBOARD_MIN_COVER_PX, 150);
  assert.equal(keyboardCover(844, 844, 0), 0, 'Safari, no keyboard');
  assert.equal(keyboardCover(844, 754, 0), 0, 'Chrome iOS toolbar, 90 px');
  assert.equal(keyboardCover(844, 764, 0), 0, '80 px');
  assert.equal(keyboardCover(844, 744, 0), 0, '100 px');
  assert.equal(keyboardCover(844, 695, 0), 0, '149 px: still browser chrome');
});

test('a real keyboard (≥ ~290 px) is still reported in full; the 150 px threshold itself counts as a keyboard', () => {
  assert.equal(keyboardCover(844, 508, 0), 336, 'iPhone keyboard');
  assert.equal(keyboardCover(844, 418, 0), 426, 'Chrome iOS toolbar + keyboard');
  assert.equal(keyboardCover(844, 694, 0), 150);
  assert.equal(keyboardCover(844, 508, 0) - keyboardCover(844, 508, 0), 0);
});

test('offsetTop counts (Safari scrolls the visual viewport when the keyboard opens); a visual viewport taller than the layout one never gives a negative cover', () => {
  assert.equal(keyboardCover(844, 400, 100), 344);
  assert.equal(keyboardCover(844, 844, 120), 0);
  assert.equal(keyboardCover(800, 900, 0), 0);
});

test('the web hook uses it; the hook only exists for the accept sheet (the R3 payment page and the chat composer do not use it)', () => {
  const hook = read('hooks/useKeyboardCover.web.ts');
  assert.match(hook, /import \{ keyboardCover \} from '\.\.\/utils\/keyboardCover';/);
  assert.match(hook, /setCover\(keyboardCover\(window\.innerHeight, viewport\.height, viewport\.offsetTop\)\)/);
  assert.match(read('hooks/useKeyboardCover.ts'), /return 0;/, 'devices: still a constant 0');
  assert.match(read('hooks/useVisualViewportInset.web.ts'), /document\.body\.getBoundingClientRect\(\)\.bottom/, 'the composer\'s own hook is untouched');
  assert.doesNotMatch(read('components/gift/GiftPayPage.web.tsx') + read('components/gift/GiftPaymentForm.web.tsx') + read('components/gift/GiftSheet.tsx'), /useKeyboardCover/);
});

test('accept sheet: any cover is a keyboard; on the web the confirm button sits OUTSIDE the scroll (always visible), on devices it stays inside as before', () => {
  const card = read('components/gift/GiftCard.tsx');
  assert.match(card, /const keyboardOpen = onWeb && keyboardInset > 0;/);
  assert.doesNotMatch(card, /keyboardInset > 100/);
  assert.match(card, /\{onWeb \? null : confirmButton\}\s*<\/ScrollView>/);
  assert.match(card, /<\/ScrollView>[\s\S]*\{onWeb \? <View style=\{styles\.confirmFooter\}>\{confirmButton\}<\/View> : null\}/);
  assert.equal((card.match(/onPress=\{\(\) => void confirm\(\)\}/g) ?? []).length, 1, 'ONE confirm button, rendered in one place or the other');
  // devices keep their KeyboardAvoidingView untouched
  assert.match(card, /<KeyboardAvoidingView behavior=\{Platform\.OS === 'ios' \? 'padding' : undefined\} style=\{onWeb \? \{ paddingBottom: keyboardInset \} : undefined\}>/);
});
