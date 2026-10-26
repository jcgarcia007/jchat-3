// Arreglo A: the user quick card shows the SAME photo as the room's avatar row (the presence payload), never the public profile,
// and an incognito person never shows their real photo. Run from mobile/:  node --test scripts/quick-card-avatar.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'quick-card-'));
writeFileSync(join(dir, 'quickCardAvatar.mjs'), ts.transpileModule(read('utils/quickCardAvatar.ts'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
const { quickCardIdentity } = await import(pathToFileURL(join(dir, 'quickCardAvatar.mjs')).href);

const present = [
  { id: 'a', avatar_url: 'https://cdn.example/a.jpg', is_incognito: false },
  { id: 'b', avatar_url: null, is_incognito: false },
  // incognito: the payload already carries a null avatar, but even a leaked photo must not be shown
  { id: 'c', avatar_url: null, is_incognito: true, nickname: 'Fantasma' },
  { id: 'd', avatar_url: 'https://cdn.example/real-face.jpg', is_incognito: true, nickname: 'Sombra' },
  { id: 'e', avatar_url: 'https://cdn.example/e.jpg', is_incognito: true },
];

test('a person with a photo in the presence payload shows that photo', () => {
  assert.deepEqual(quickCardIdentity(present, 'a'), { avatarUrl: 'https://cdn.example/a.jpg', nickname: undefined });
});

test('a person without a photo in the payload gets the initial (no avatar)', () => {
  assert.deepEqual(quickCardIdentity(present, 'b'), { avatarUrl: undefined, nickname: undefined });
});

test('an incognito person shows the nickname and NEVER a photo, even if the payload carried one', () => {
  assert.deepEqual(quickCardIdentity(present, 'c'), { avatarUrl: undefined, nickname: 'Fantasma' });
  assert.deepEqual(quickCardIdentity(present, 'd'), { avatarUrl: undefined, nickname: 'Sombra' });
  assert.deepEqual(quickCardIdentity(present, 'e'), { avatarUrl: undefined, nickname: undefined });
});

test('someone who is not in the live presence list gets no photo (the public profile is never consulted)', () => {
  assert.deepEqual(quickCardIdentity(present, 'zzz'), { avatarUrl: undefined, nickname: undefined });
  assert.deepEqual(quickCardIdentity([], 'a'), { avatarUrl: undefined, nickname: undefined });
  assert.doesNotMatch(read('utils/quickCardAvatar.ts'), /public_profiles|supabase|avatarCache|profileCache/, 'pure: no I/O, no profile lookup');
});

test('ChatRoomScreen feeds the card from the same list as the avatar row (usersInRoom) and passes targetAvatar', () => {
  const room = read('screens/chat/ChatRoomScreen.tsx');
  assert.match(room, /import \{ quickCardIdentity \} from '\.\.\/\.\.\/utils\/quickCardAvatar';/);
  assert.match(room, /const usersInRoomRef = useRef\(usersInRoom\);\s*usersInRoomRef\.current = usersInRoom;/);
  assert.match(room, /const identity = quickCardIdentity\(usersInRoomRef\.current, userId\);/);
  assert.match(room, /userName: identity\.nickname \?\? displayName, avatarUrl: identity\.avatarUrl/);
  assert.match(room, /targetAvatar=\{quickCard\.avatarUrl\}/);
  // the row itself (ChatTopBar) draws the photo only for non-incognito people: same rule
  assert.match(read('components/chat/ChatTopBar.tsx'), /!user\.is_incognito && user\.avatar_url/);
});
