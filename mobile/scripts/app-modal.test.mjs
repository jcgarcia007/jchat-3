// Guards the web layout of modals: no file may import `Modal` from 'react-native' except AppModal itself. Run from mobile/:
//   node --test scripts/app-modal.test.mjs
//
// On the web React Native's Modal paints over the whole browser window while the app lives in a 480 px column; every
// modal must go through components/common/AppModal (which confines it to the column on wide screens).

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIP = new Set(['node_modules', 'ios', 'android', 'dist-web', '.expo', '.git', 'scripts']);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || name.startsWith('dist')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx|js|jsx)$/.test(name) && !name.endsWith('.d.ts')) yield full;
  }
}

const IMPORT_FROM_RN = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]react-native['"]/gs;

test('no file imports Modal from react-native outside AppModal*', () => {
  const offenders = [];
  for (const file of walk(ROOT)) {
    const rel = relative(ROOT, file);
    if (/(^|\/)AppModal(\.web)?\.tsx$/.test(rel)) continue;
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(IMPORT_FROM_RN)) {
      if (m[1].split(',').map((x) => x.trim().split(/\s+as\s+/)[0]).includes('Modal')) offenders.push(rel);
    }
    if (/\brequire\(\s*['"]react-native['"]\s*\)\s*\.Modal\b/.test(src)) offenders.push(rel);
  }
  assert.deepEqual([...new Set(offenders)], [], 'use AppModal from components/common/AppModal instead of react-native Modal');
});

test('AppModal exists for both platforms and the web one confines the content to the app column', () => {
  const native = readFileSync(join(ROOT, 'components/common/AppModal.tsx'), 'utf8');
  const web = readFileSync(join(ROOT, 'components/common/AppModal.web.tsx'), 'utf8');
  assert.match(native, /export const AppModal = Modal/);
  assert.match(web, /WEB_COLUMN_WIDTH/);
  assert.match(web, /columnLeftWithPanel/);
});
