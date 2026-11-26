// H-033 / H-091: every link to jchat.cloud/privacy|terms|safety|contact|support carries ?lang= (the app's language).
// Run from mobile/:  node --test scripts/legal-links.test.mjs
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');
const js = ts.transpileModule(read('utils/legalLinks.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', js)(mod, mod.exports);
const { legalUrl } = mod.exports;

test('legalUrl: ?lang=es for Spanish (any region), ?lang=en for everything else', () => {
  assert.equal(legalUrl('privacy', 'es'), 'https://jchat.cloud/privacy?lang=es');
  assert.equal(legalUrl('terms', 'es-MX'), 'https://jchat.cloud/terms?lang=es');
  assert.equal(legalUrl('safety', 'en'), 'https://jchat.cloud/safety?lang=en');
  assert.equal(legalUrl('contact', 'fr'), 'https://jchat.cloud/contact?lang=en');
  assert.equal(legalUrl('support', undefined), 'https://jchat.cloud/support?lang=en');
  assert.equal(legalUrl('support', null), 'https://jchat.cloud/support?lang=en');
});

function walk(dir, out = []) {
  for (const name of readdirSync(join(root, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) walk(rel, out);
    else if (/\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}

test('no screen, component or service writes a legal URL by hand (they all use legalUrl)', () => {
  const offenders = [];
  for (const dir of ['screens', 'components', 'services', 'navigation', 'utils']) {
    for (const file of walk(dir)) {
      if (file === 'utils/legalLinks.ts') continue;
      if (/jchat\.cloud\/(privacy|terms|safety|contact|support)/.test(read(file))) offenders.push(file);
    }
  }
  assert.deepEqual(offenders, []);
});

test('Settings opens the four legal pages in the app language', () => {
  const source = read('screens/settings/SettingsScreen.tsx');
  for (const page of ['privacy', 'terms', 'safety', 'contact']) assert.match(source, new RegExp(`legalUrl\\('${page}', i18n\\.language\\)`));
});
