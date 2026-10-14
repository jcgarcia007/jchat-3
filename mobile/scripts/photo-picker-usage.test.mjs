// Guard for the photo-library permission (see services/photoPicker.ts). Run from mobile/:
//   node scripts/photo-picker-usage.test.mjs
// app.config.ts blocks READ/WRITE_EXTERNAL_STORAGE and READ_MEDIA_* in the Android manifest, and
// ImagePicker.requestMediaLibraryPermissionsAsync() on Android < 13 asks for exactly those: with them blocked it answers
// "denied" without a dialog, so a screen that required "granted" never opens the picker. The system photo picker needs
// no permission, so the library permission must not be requested anywhere, and the library is opened in ONE place.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const SKIP = new Set(['node_modules', 'dist-web', 'dist-web-audit', 'ios', 'android', 'scripts', '.expo', 'assets']);

function* sources(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.(ts|tsx)$/.test(name)) yield path;
  }
}

const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''); // comments may mention the names

const offenders = { permission: [], launch: [] };
for (const file of sources(root)) {
  const text = code(readFileSync(file, 'utf8'));
  const rel = relative(root, file);
  if (/(request|get)MediaLibraryPermissionsAsync|useMediaLibraryPermissions/.test(text)) offenders.permission.push(rel);
  if (/launchImageLibraryAsync/.test(text) && rel !== 'utils/safePicker.ts') offenders.launch.push(rel);
}

assert.deepEqual(offenders.permission, [], `the photo-library permission must not be requested (Android blocks it): ${offenders.permission.join(', ')}`);
assert.deepEqual(offenders.launch, [], `open the library through services/photoPicker.ts (utils/safePicker.ts), not directly: ${offenders.launch.join(', ')}`);
console.log('photo picker usage OK');
