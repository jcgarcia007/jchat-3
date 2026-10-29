// The main screens (room, DMs, profile, gift, menu, cart, checkout, settings, Match, Truth or Dare, stories) must keep:
//   · no icon-only button without an accessibility label (scanner of a11y-icon-buttons.mjs, here limited to these files and with NO exceptions)
//   · no pressable that declares a size under 44 pt without hitSlop (Rule T)
//   · no image without a description that is not hidden from screen readers (Rule I)
//   · no text that ignores the person's font size (Rule F)
// Run from mobile/:  node --test scripts/a11y-main-screens.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { join } from 'node:path';
import { MAIN_SCREEN_FILES, scanMainScreens, scanSource } from './a11y-main-screens.mjs';
import { scanSource as scanIconButtons } from './a11y-icon-buttons.mjs';

const mobile = new URL('..', import.meta.url).pathname;
const rules = (code) => scanSource(code).map((h) => h.rule);

test('Rule T: a small pressable needs hitSlop', () => {
  assert.deepEqual(rules(`const A = () => <Pressable style={{ width: 32, height: 32 }} onPress={f}><Text>x</Text></Pressable>;`), ['T']);
  assert.deepEqual(rules(`const s = StyleSheet.create({ b: { width: 30, height: 30 } }); const A = () => <Pressable style={s.b}><Text>x</Text></Pressable>;`), ['T']);
  assert.deepEqual(rules(`const A = () => <Pressable hitSlop={8} style={{ width: 32, height: 32 }}><Text>x</Text></Pressable>;`), []);
  assert.deepEqual(rules(`const A = () => <Pressable style={{ width: 32, minHeight: 44 }}><Text>x</Text></Pressable>;`), ['T'], 'width 32 is still small');
  assert.deepEqual(rules(`const A = () => <Pressable style={{ minWidth: 44, minHeight: 44 }}><Text>x</Text></Pressable>;`), []);
});

test('Rule I: an image needs a description or to be hidden from the screen reader', () => {
  assert.deepEqual(rules(`const A = () => <Image source={s} />;`), ['I']);
  assert.deepEqual(rules(`const A = () => <Image source={s} accessibilityLabel="Foto" />;`), []);
  assert.deepEqual(rules(`const A = () => <Image source={s} accessible={false} />;`), []);
  assert.deepEqual(rules(`const A = () => <Image source={s} alt="Foto" />;`), []);
});

test('Rule F: allowFontScaling={false} is reported', () => {
  assert.deepEqual(rules(`const A = () => <Text allowFontScaling={false}>x</Text>;`), ['F']);
  assert.deepEqual(rules(`const A = () => <Text allowFontScaling>x</Text>;`), []);
});

test('every main screen file exists (a rename must update the list)', () => {
  const { missing } = scanMainScreens(mobile);
  assert.deepEqual(missing, []);
});

test('the main screens have no findings for rules T, I and F', () => {
  const { hits } = scanMainScreens(mobile);
  assert.deepEqual(hits.map((h) => `${h.file}:${h.line} ${h.rule} <${h.tag}> ${h.detail}`), []);
});

test('the main screens have no unlabeled icon-only button and no focusable backdrop (no exceptions)', () => {
  const offenders = [];
  for (const rel of MAIN_SCREEN_FILES) {
    for (const o of scanIconButtons(readFileSync(join(mobile, rel), 'utf8'), rel)) offenders.push(`${rel}:${o.line} <${o.tag}> ${o.rule}`);
  }
  assert.deepEqual(offenders, []);
});
