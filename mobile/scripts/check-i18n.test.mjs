// scripts/check-i18n.mjs (repo root): Spanish and English must have the same keys, no empty values, the same variables
// ({{x}} in the app, {x} / ICU in the web), and no text written by hand in the components. The script prints the details.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('translations: es/en parity, no empties, same variables, nothing hand-written', () => {
  const run = spawnSync(process.execPath, [join(root, 'scripts', 'check-i18n.mjs')], { encoding: 'utf8' });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /0 problem\(s\) — OK/);
});

test('the script reports a missing key and different variables in a fixture (it is not always green)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'i18n-'));
  mkdirSync(join(tmp, 'mobile', 'i18n', 'locales', 'en'), { recursive: true });
  mkdirSync(join(tmp, 'mobile', 'i18n', 'locales', 'es'), { recursive: true });
  mkdirSync(join(tmp, 'scripts'), { recursive: true });
  writeFileSync(join(tmp, 'mobile', 'i18n', 'locales', 'en', 'a.json'), JSON.stringify({ hello: 'Hello {{name}}', only: 'Only English' }));
  writeFileSync(join(tmp, 'mobile', 'i18n', 'locales', 'es', 'a.json'), JSON.stringify({ hello: 'Hola' }));
  writeFileSync(join(tmp, 'scripts', 'check-i18n.mjs'), readFileSync(join(root, 'scripts', 'check-i18n.mjs'), 'utf8'));
  const run = spawnSync(process.execPath, [join(tmp, 'scripts', 'check-i18n.mjs')], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(run.stdout, /missing in es \(1\)[\s\S]*only/);
  assert.match(run.stdout, /different variables \(1\)[\s\S]*hello/);
});
