// Profile (Liquid Glass): no counters, no floating button, labelled capsules, "Your network" in Edit profile, privacy rule of the ⋯ menu, and the pure
// rule that decides when the compact header appears. Run from mobile/:  node --test scripts/profile-glass.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const header = read('components/profile/ProfileHeader.tsx');
const screen = read('screens/profile/ProfileScreen.tsx');
const edit = read('screens/profile/EditProfileScreen.tsx');
const network = read('components/profile/YourNetwork.tsx');

test('the profile shows no Posts / Followers / Following counters', () => {
  assert.doesNotMatch(header, /header\.(posts|followers|statsA11y)/);
  assert.doesNotMatch(header, /<Stat\b/);
  assert.doesNotMatch(screen, /getProfileCounts/);
});

test('no floating "+" button: publishing is a capsule next to Edit profile', () => {
  assert.doesNotMatch(screen, /testID="profile-fab"|FloatingButton|styles\.fab/);
  assert.match(header, /testID="profile-publish"/);
  assert.match(header, /testID="profile-edit"/);
});

test('every capsule and round button carries an accessibility label', () => {
  for (const id of ['profile-edit', 'profile-publish']) {
    const line = header.split('\n').find((l) => l.includes(`testID="${id}"`));
    assert.ok(line, id);
    assert.match(line, /accessibilityLabel=/, id);
  }
  assert.doesNotMatch(read('components/profile/GlassIconButton.tsx'), /accessibilityLabel=\{undefined\}/);
});

test('"Your network" lists followers, following and requests, with the dot for pending requests', () => {
  for (const tab of ['followers', 'following', 'requests']) assert.match(network, new RegExp(`tab: '${tab}'`));
  assert.match(network, /edit-network-requests-dot/);
  assert.match(edit, /<YourNetwork\b/);
});

test('the ⋯ menu only offers the lists when the viewer may see the profile and nobody blocked', () => {
  assert.match(screen, /const canSeeNetwork = !isOwnProfile && canViewPosts && relation !== 'blockedByMe' && relation !== 'blockedMe'/);
  assert.match(screen, /canSeeNetwork \? \(/);
});

test('pure rule of the compact header', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'profile-header-state-'));
  writeFileSync(join(dir, 's.mjs'), ts.transpileModule(read('utils/profileHeaderState.ts'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
  const { isCompactHeader, COMPACT_SCROLL_Y } = await import(pathToFileURL(join(dir, 's.mjs')).href);
  assert.equal(isCompactHeader(0), false);
  assert.equal(isCompactHeader(-80), false, 'iOS bounce is never compact');
  assert.equal(isCompactHeader(COMPACT_SCROLL_Y), false);
  assert.equal(isCompactHeader(COMPACT_SCROLL_Y + 1), true);
  assert.equal(isCompactHeader(Number.NaN), false);
});

test('there is a single Settings button on the profile (the glass one over the cover; the compact bar one only replaces it)', () => {
  assert.equal((header.match(/testID="profile-open-settings"/g) ?? []).length, 1);
  assert.equal((header.match(/testID="profile-open-settings-compact"/g) ?? []).length, 1);
  assert.equal((header.match(/<IconSettings\b/g) ?? []).length, 2, 'cover + compact bar, nothing else');
  assert.doesNotMatch(screen, /IconSettings|open-settings/);
});

test('the empty state of the profile has no "New post" button: "+ Publish" is right above', () => {
  assert.doesNotMatch(screen, /empty\.createPost/);
  assert.doesNotMatch(screen, /navigation\.navigate\('CreatePost'\)[^\n]*accent=\{theme\.accent\}/);
});
