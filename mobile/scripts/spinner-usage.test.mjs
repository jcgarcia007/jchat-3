// JChat 3.0 — every spinner has an accessible name: no file under mobile/ may use react-native's ActivityIndicator
// directly (components/common/Spinner.tsx wraps it with a translated "Cargando…" label). Run:
//   node scripts/spinner-usage.test.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-web', 'dist-web-audit', 'ios', 'android', '.expo', 'scripts']);
const ALLOWED = path.join('components', 'common', 'Spinner.tsx');

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(tsx?|jsx?)$/.test(name)) yield full;
  }
}

const offenders = [];
for (const file of walk(root)) {
  const rel = path.relative(root, file);
  if (rel === ALLOWED) continue;
  if (/\bActivityIndicator\b/.test(readFileSync(file, 'utf8'))) offenders.push(rel);
}

if (offenders.length > 0) {
  console.error(`ActivityIndicator used directly (use components/common/Spinner):\n  ${offenders.join('\n  ')}`);
  process.exit(1);
}
console.log('spinner usage OK');
