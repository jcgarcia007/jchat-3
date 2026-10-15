// Fails when a pressable that shows ONLY an icon has no accessibility label (screen readers say "button" and nothing else),
// or when a full-screen backdrop Pressable is left focusable without a label. Run from mobile/:
//   node --test scripts/a11y-icon-buttons.test.mjs
//
// How it works (TypeScript AST over every .tsx under mobile/, minus node_modules, builds, scripts, web-stubs, i18n):
//   Rule A — a Pressable / TouchableOpacity / TouchableHighlight / TouchableWithoutFeedback / TouchableNativeFeedback with
//            an `Icon*` element inside, NO <Text> (or text node) inside, and no accessibilityLabel / aria-label.
//   Rule B — one with onPress, no label, no `accessible` prop at all and only empty <View>s (or nothing) inside: a backdrop.
//            Fix: `accessible={false}` (it is a click-catcher, not a control) or a label.
// LIMITS (heuristic, on purpose): it does not follow components — an icon passed as a prop (`icon={<IconX/>}` to a wrapper) or
// a label added by a wrapper is invisible to it; a Pressable with {...props} spread is skipped (the label may be inside);
// buttons whose icon comes from a variable (`{icon}`) are not Rule A; text-only buttons are not checked at all; it cannot
// judge whether the label is a GOOD label. Use it as a floor, and the axe run of `npm run web:audit` as the second check.

import assert from 'node:assert/strict';
import test from 'node:test';
import { scanProject, scanSource } from './a11y-icon-buttons.mjs';

const hits = (code) => scanSource(code, 'fixture.tsx');

test('Rule A: icon-only pressables without a label are reported', () => {
  assert.equal(hits(`const A = () => <Pressable onPress={f}><IconX size={20} /></Pressable>;`).length, 1);
  assert.equal(hits(`const A = () => <TouchableOpacity onPress={f} hitSlop={8}><View><IconPlus /></View></TouchableOpacity>;`).length, 1);
  assert.equal(hits(`const A = () => <Pressable onPress={f} accessibilityRole="button"><IconMinus /></Pressable>;`).length, 1, 'a role alone is not a label');
});

test('Rule A: labelled, text, or unknown pressables are fine', () => {
  assert.equal(hits(`const A = () => <Pressable accessibilityLabel={t('x')} onPress={f}><IconX /></Pressable>;`).length, 0);
  assert.equal(hits(`const A = () => <Pressable aria-label="x" onPress={f}><IconX /></Pressable>;`).length, 0);
  assert.equal(hits(`const A = () => <Pressable onPress={f}><IconX /><Text>Cerrar</Text></Pressable>;`).length, 0);
  assert.equal(hits(`const A = () => <Pressable onPress={f}><IconX />Cerrar</Pressable>;`).length, 0);
  assert.equal(hits(`const A = (p) => <Pressable {...p}><IconX /></Pressable>;`).length, 0, 'spread: the label may be inside');
  assert.equal(hits(`const A = () => <Pressable onPress={f}>{icon}</Pressable>;`).length, 0, 'icon from a variable: not visible to the scanner');
});

test('Rule B: backdrops must be hidden from the screen reader or labelled', () => {
  assert.equal(hits(`const A = () => <Pressable style={s.overlay} onPress={onClose} />;`).length, 1);
  assert.equal(hits(`const A = () => <TouchableWithoutFeedback onPress={onClose}><View style={s.scrim} /></TouchableWithoutFeedback>;`).length, 1);
  assert.equal(hits(`const A = () => <Pressable accessible={false} style={s.overlay} onPress={onClose} />;`).length, 0);
  assert.equal(hits(`const A = () => <Pressable accessibilityLabel="Cerrar" onPress={onClose} />;`).length, 0);
  assert.equal(hits(`const A = () => <Pressable onPress={f}><Text>Aceptar</Text></Pressable>;`).length, 0);
  assert.equal(hits(`const A = () => <Pressable onPress={f}>{children}</Pressable>;`).length, 0, 'opaque children: not a plain backdrop');
});

test('the whole app has no unlabeled icon-only button and no focusable backdrop', () => {
  const offenders = scanProject(new URL('..', import.meta.url).pathname);
  assert.deepEqual(offenders.map((o) => `${o.file}:${o.line} <${o.tag}> ${o.rule}`), []);
});
