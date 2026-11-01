// Profile "C2 compacto": a 144 pt avatar centred on the sheet's top edge, everything under it centred, the compact-header threshold derived from the constants.
// Pure part: utils/profileHeaderState.ts. Run from mobile/:  node --test scripts/profile-c2.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'profile-c2-'));
writeFileSync(join(dir, 's.mjs'), ts.transpileModule(read('utils/profileHeaderState.ts'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
const state = await import(pathToFileURL(join(dir, 's.mjs')).href);
const header = read('components/profile/ProfileHeader.tsx');

test('AVATAR_SIZE is 144 and the cover is as tall as the avatar position needs (171)', () => {
  assert.equal(state.AVATAR_SIZE, 144);
  assert.equal(state.AVATAR_BORDER, 4);
  assert.equal(state.BUTTONS_BELOW_INSET, 7);
  assert.equal(state.COVER_BELOW_INSET, 171);
});

test('the avatar top sits 8 pt under the glass buttons: buttons bottom + 8 = sheet top - AVATAR_SIZE / 2', () => {
  const buttonsBottom = state.BUTTONS_BELOW_INSET + state.BUTTON_SIZE;
  const sheetTop = state.COVER_BELOW_INSET - state.SHEET_OVERLAP;
  assert.equal(sheetTop - state.AVATAR_SIZE / 2 - buttonsBottom, 8);
  assert.equal(state.AVATAR_GAP_BELOW_BUTTONS, 8);
});

test('NAME_TOP = AVATAR_SIZE / 2 + gap (84); NAME_LEFT is gone', () => {
  assert.equal(state.NAME_TOP, state.AVATAR_SIZE / 2 + state.NAME_GAP);
  assert.equal(state.NAME_TOP, 84);
  assert.equal(state.NAME_LEFT, undefined);
  assert.doesNotMatch(header, /NAME_LEFT/);
});

test('the compact-header threshold is derived from the constants (211), never a loose number', () => {
  const expected = state.COVER_BELOW_INSET - state.SHEET_OVERLAP + state.NAME_TOP + state.NAME_BLOCK_HEIGHT - (state.BUTTONS_BELOW_INSET + state.COMPACT_HEIGHT);
  assert.equal(state.COMPACT_SCROLL_Y, expected);
  assert.equal(state.COMPACT_SCROLL_Y, 211);
  assert.equal(state.isCompactHeader(211), false);
  assert.equal(state.isCompactHeader(212), true);
  assert.equal(state.isCompactHeader(-30), false, 'iOS bounce is never compact');
  assert.match(read('utils/profileHeaderState.ts'), /COMPACT_SCROLL_Y = COVER_BELOW_INSET - SHEET_OVERLAP \+ NAME_TOP \+ NAME_BLOCK_HEIGHT - \(BUTTONS_BELOW_INSET \+ COMPACT_HEIGHT\)/);
});

test('the avatar is centred (left 50% with marginLeft -AVATAR_SIZE / 2) on the sheet edge', () => {
  const style = header.slice(header.indexOf('avatarBorder: {'), header.indexOf('avatar: {'));
  assert.match(style, /left: '50%'/);
  assert.match(style, /marginLeft: -AVATAR_SIZE \/ 2/);
  assert.match(style, /top: -AVATAR_SIZE \/ 2/);
  assert.doesNotMatch(style, /left: 20/);
});

test('name, @username, bio, city and capsules are centred; capsules are 44 pt tall and at most 160 wide', () => {
  assert.match(header, /nameBlock: \{[^}]*alignItems: 'center'/);
  assert.match(header, /nameRow: \{[^}]*justifyContent: 'center'/);
  assert.match(header, /displayName: \{[^}]*fontSize: 26[^}]*textAlign: 'center'/);
  assert.match(header, /handle: \{[^}]*textAlign: 'center'/);
  assert.match(header, /bio: \{[^}]*textAlign: 'center'/);
  assert.match(header, /cityRow: \{[^}]*justifyContent: 'center'/);
  assert.match(header, /capsules: \{[^}]*justifyContent: 'center'/);
  assert.match(header, /const CAPSULE_MAX_WIDTH = 160/);
  assert.match(header, /capsuleCell: \{ flex: 1, maxWidth: CAPSULE_MAX_WIDTH, height: 44 \}/);
  assert.match(header, /capsule: \{ height: 44,/);
});

test('the fallback initials are 44 pt', () => {
  assert.match(header, /avatarInitials: \{ fontSize: 44,/);
});

test('the skeleton follows the new geometry: same constants, centred lines, capsules capped at 160', () => {
  const skeleton = header.slice(header.indexOf('export function ProfileHeaderSkeleton'), header.indexOf('export function ProfileCompactBar'));
  assert.match(skeleton, /topInset \+ COVER_BELOW_INSET/);
  assert.match(skeleton, /AVATAR_SIZE - AVATAR_BORDER \* 2/);
  assert.match(skeleton, /styles\.avatarBorder/, 'the same centred avatar ring');
  assert.match(skeleton, /styles\.nameBlock/, 'the same centred name block');
  assert.match(header, /skeletonCapsule: \{ flex: 1, maxWidth: CAPSULE_MAX_WIDTH \}/);
});
