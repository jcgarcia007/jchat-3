// The avatar is stored in two versions (256 px and 1024 px "@2x") under the person's folder; users.avatar_url keeps pointing to the small one and the big URL is
// derived from it, with a fallback for accounts that only have the small one. Pure part: utils/avatarUrls.ts. Run from mobile/:  node --test scripts/avatar-pair.test.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const js = ts.transpileModule(read('utils/avatarUrls.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', js)(mod, mod.exports);
const { largeAvatarUrl, avatarPairNames, AVATAR_SMALL_SIDE, AVATAR_LARGE_SIDE } = mod.exports;

const BASE = 'https://abc.supabase.co/storage/v1/object/public/avatars';
const UID = '3f2a9c1e-0000-4000-8000-000000000001';

test('sizes: 256 px for lists and chats, 1024 px for the header and the viewer', () => {
  assert.equal(AVATAR_SMALL_SIDE, 256);
  assert.equal(AVATAR_LARGE_SIDE, 1024);
});

test('the big URL is the small one with @2x before the extension, keeping a query string', () => {
  assert.equal(largeAvatarUrl(`${BASE}/${UID}/1730000000000.jpg`), `${BASE}/${UID}/1730000000000@2x.jpg`);
  assert.equal(largeAvatarUrl(`${BASE}/${UID}/1730000000000.png`), `${BASE}/${UID}/1730000000000@2x.png`);
  assert.equal(largeAvatarUrl(`${BASE}/${UID}/1730000000000.jpg?t=5`), `${BASE}/${UID}/1730000000000@2x.jpg?t=5`);
});

test('anything that is not one of our avatars has no big version (it is shown as it is)', () => {
  assert.equal(largeAvatarUrl(null), null);
  assert.equal(largeAvatarUrl(undefined), null);
  assert.equal(largeAvatarUrl(''), null);
  assert.equal(largeAvatarUrl('https://example.com/me.jpg'), null);
  assert.equal(largeAvatarUrl('file:///data/user/0/app/cache/ImageManipulator/abc.jpg'), null);
  assert.equal(largeAvatarUrl(`${BASE}/${UID}/me.jpg`), null, 'the name must be the upload timestamp');
  assert.equal(largeAvatarUrl(`${BASE}/${UID}/1730000000000@2x.jpg`), null, 'a big URL has no bigger one');
});

test('the pair is named <ts> and <ts>@2x, and the big name is what largeAvatarUrl derives', () => {
  const names = avatarPairNames(1730000000000);
  assert.deepEqual(names, { small: '1730000000000', large: '1730000000000@2x' });
  assert.equal(largeAvatarUrl(`${BASE}/${UID}/${names.small}.jpg`), `${BASE}/${UID}/${names.large}.jpg`);
});

// ── Static checks on the upload and the callers ────────────────────────────────

const avatar = read('services/avatar.ts');

test('uploadAvatarPair makes a centred square, a 256 px and a 1024 px JPEG (never enlarged), small first; the big one failing does not fail the avatar', () => {
  assert.match(avatar, /export async function uploadAvatarPair\(userId: string, localUri: string, mimeType\?: string \| null\): Promise<string>/);
  assert.match(avatar, /centerSquareCrop\(source\.width, source\.height\)/);
  assert.match(avatar, /avatarOutputSide\(rect\.width, target\)/);
  assert.match(avatar, /small = await render\(AVATAR_SMALL_SIDE\);\s*large = await render\(AVATAR_LARGE_SIDE\);/);
  assert.match(avatar, /SaveFormat\.JPEG, compress: 0\.85/);
  assert.match(avatar, /const smallUrl = await uploadImage\(userId, small, AVATAR_BUCKET, 'image\/jpeg', names\.small\);/);
  assert.match(avatar, /try \{\s*await uploadImage\(userId, large, AVATAR_BUCKET, 'image\/jpeg', names\.large\);\s*\} catch/);
  assert.match(avatar, /return smallUrl;/);
});

test('if the photo cannot be processed the original goes up as before (legacy single avatar); without a backend nothing is processed', () => {
  assert.match(avatar, /if \(!isSupabaseConfigured\) return localUri;/);
  assert.match(avatar, /catch \(err\) \{\s*console\.warn\('\[avatar\] could not make the two versions[^']*', err\);\s*return uploadImage\(userId, localUri, AVATAR_BUCKET, mimeType\);/);
});

test('both ways to change the photo use the pair: the chat/profile flow (changeMyAvatar) and Edit profile\'s Save; the object name is controllable', () => {
  assert.match(avatar, /const url = await uploadAvatarPair\(userId, prepared\.uri, prepared\.mimeType\);/);
  const edit = read('screens/profile/EditProfileScreen.tsx');
  assert.match(edit, /import \{ uploadAvatarPair \} from '\.\.\/\.\.\/services\/avatar';/);
  assert.match(edit, /finalAvatarUrl = await uploadAvatarPair\(authUser\.id, avatarUri\);/);
  assert.doesNotMatch(edit, /uploadImage/, 'Edit profile no longer uploads the avatar by itself');
  const storage = read('services/storage.ts');
  assert.match(storage, /fileName\?: string,/);
  assert.match(storage, /const path = `\$\{userId\}\/\$\{fileName \?\? Date\.now\(\)\}\.\$\{ext\}`;/);
  assert.match(avatar, /from\('users'\)\.update\(\{ avatar_url: url,/, 'users.avatar_url is the SMALL url');
});

test('the header draws the small photo with the big one over it (a missing big one leaves the small one); the viewer asks for the big one with the small as fallback', () => {
  const header = read('components/profile/ProfileHeader.tsx');
  assert.match(header, /function AvatarPhoto\(\{ uri \}: \{ uri: string \}\)/);
  assert.match(header, /<Image source=\{\{ uri \}\} style=\{StyleSheet\.absoluteFill\}/);
  assert.match(header, /\{big \? <Image source=\{\{ uri: big \}\} style=\{StyleSheet\.absoluteFill\}/);
  assert.match(header, /<AvatarPhoto uri=\{avatarUrl\} \/>/);
  const screen = read('screens/profile/ProfileScreen.tsx');
  assert.match(screen, /uris=\{profile\.avatar_url \? \[largeAvatarUrl\(profile\.avatar_url\) \?\? profile\.avatar_url\] : undefined\}/);
  assert.match(screen, /fallbackUris=\{profile\.avatar_url \? \[profile\.avatar_url\] : undefined\}/);
});

test('no database, bucket or policy changes: no migration mentions the pair, and only expo-image-manipulator (already installed) does the resizing', () => {
  const migrations = readdirSync(new URL('../../supabase/migrations/', import.meta.url));
  for (const file of migrations) assert.doesNotMatch(readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'), /@2x/, file);
  assert.match(read('package.json'), /"expo-image-manipulator"/);
  assert.ok(existsSync(new URL('../services/avatar.ts', import.meta.url)));
  assert.match(avatar, /from 'expo-image-manipulator'/);
});
