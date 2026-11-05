// Screens that pin buttons to the bottom edge must clear the Android navigation bar (3-button navigation).
// Run from mobile/:  node --test scripts/android-navbar.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'safe-bottom-'));
const file = join(dir, 'safeBottom.mjs');
writeFileSync(file, ts.transpileModule(read('../utils/safeBottom.ts'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText);
const { safeBottomPadding } = await import(pathToFileURL(file).href);

test('the padding is the design value, or the bar plus air when that is larger', () => {
  assert.equal(safeBottomPadding(32, 0), 32);       // no bar (older iPhones, gesture-less)
  assert.equal(safeBottomPadding(32, 24), 40);      // gesture pill on Android: 24 + 16
  assert.equal(safeBottomPadding(32, 48), 64);      // 3-button bar: 48 + 16
  assert.equal(safeBottomPadding(48, 34), 50);      // iPhone home indicator
  assert.equal(safeBottomPadding(32, Number.NaN), 32);
});

test('Welcome pads its buttons with the bottom inset', () => {
  const welcome = read('../screens/auth/WelcomeScreen.tsx');
  assert.match(welcome, /safeBottomPadding\(Platform\.OS === 'ios' \? 48 : 32, insets\.bottom\)/);
});

test('Login and Register scroll inside TicketShell, which pads the end of the scroll with insets.bottom', () => {
  const shell = read('../components/auth/TicketShell.tsx');
  assert.match(shell, /paddingBottom: insets\.bottom \+ 28/);
  for (const f of ['LoginScreen', 'RegisterStep1Screen']) {
    assert.match(read(`../screens/auth/${f}.tsx`), /<TicketShell/, f);
  }
});

test('B6 matrix fixes: a status-bar baseline, the entry sheet clears the nav bar, the chat gives room back with the keyboard up, the compact profile bar has an opaque status strip', () => {
  const app = read('../App.tsx');
  assert.match(app, /<StatusBar barStyle=\{colorScheme === 'light' \? 'dark-content' : 'light-content'\} \/>/);
  const chat = read('../screens/chat/ChatRoomScreen.tsx');
  assert.match(chat, /paddingBottom: Math\.max\(48, gateInsets\.bottom \+ 24\)/);
  const top = read('../components/chat/ChatTopBar.tsx');
  assert.match(top, /usersInRoom\.length > 0 && !keyboardOpen/);
  assert.match(top, /useKeyboardOpen\(\)/);
  const profile = read('../screens/profile/ProfileScreen.tsx');
  assert.match(profile, /height: insets\.top, backgroundColor: c\.bgBase/);
});
