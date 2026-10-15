// Fails when a text a person can read or hear is written in the code instead of going through t() (react-i18next), and when
// the Spanish and English files do not have the same keys. Run from mobile/:
//   node --test scripts/i18n-hardcoded.test.mjs
//
// How it works (TypeScript AST over every .ts/.tsx under mobile/, minus node_modules, builds, scripts, i18n, theme, types):
//   1. text between tags:               <Text>Hola</Text>
//   2. a literal rendered as a child:   {'Hola'}  {open ? 'Abierto' : 'Cerrado'}
//   3. visible props:                   placeholder / accessibilityLabel / accessibilityHint / aria-label / alt / title / label /
//                                       message / subtitle / hint / description / sublabel / helperText / errorText /
//                                       confirmText / cancelText with a literal value
//   4. dialogs and announcements:       Alert.alert('…') / showAlert('…') / confirm('…') / showToast('…') (first two arguments)
//   5. option lists:                    { label: 'Hola' } { title: '…' } { message: '…' } … (the keys in TEXT_KEYS)
//   6. text setters:                    setError('…') setMessage('…') setNotice('…') showNotice('…') …
//
// WHITELIST (scripts/i18n-hardcoded.mjs, WHITELIST): a literal that is only a brand / product name, a protocol or an
// abbreviation (JChat, Match, Stripe, QR, BT, mm, VIP, English, Español…), or only symbols / numbers / one letter. Ids, i18n keys
// ('main.previewDm'), paths and urls are not sentences. Variables named DEMO_* / MOCK_* / SAMPLE_* / FIXTURE_* (demo business data)
// are skipped. One-off exceptions: `// i18n-ignore: <reason>` on the same or the previous line (a reason is required).
//
// OUT OF SCOPE (on purpose): the legal texts of web/, product names and business data (menus, events, names), and what it cannot
// see: a string built somewhere else and passed through a variable, text inside images, and whether a translation is GOOD.
// A doubtful English translation is left with a `// i18n-review` comment next to the code that uses the key and listed in the report.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { scanProject, scanSource } from './i18n-hardcoded.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const hits = (code) => scanSource(code, 'fixture.tsx');
const kinds = (code) => hits(code).map((h) => h.kind);

test('text between tags and rendered literals are reported', () => {
  assert.deepEqual(kinds(`const A = () => <Text>Hola amigo</Text>;`), ['jsx-text']);
  assert.deepEqual(kinds(`const A = () => <Text>{'Hola amigo'}</Text>;`), ['jsx-expression']);
  assert.deepEqual(kinds(`const A = () => <Text>{open ? 'Abierto' : 'Cerrado'}</Text>;`), ['jsx-expression', 'jsx-expression']);
  assert.deepEqual(kinds('const A = () => <Text>{`Hola ${name}`}</Text>;'), ['jsx-expression']);
  assert.deepEqual(kinds(`const A = () => <View><Text>{t('a')} personas</Text></View>;`), ['jsx-text'], 'a word next to a t() call');
});

test('visible props are reported, in any quoting', () => {
  assert.deepEqual(kinds(`const A = () => <TextInput placeholder="Tu nombre" />;`), ['prop:placeholder']);
  assert.deepEqual(kinds(`const A = () => <Pressable accessibilityLabel={'Cerrar'} />;`), ['prop:accessibilityLabel']);
  assert.deepEqual(kinds(`const A = () => <Sheet title={ok ? 'Listo' : 'Error'} />;`), ['prop:title', 'prop:title']);
  assert.deepEqual(kinds(`const A = () => <Row label="Idioma" hint="Cambia el idioma" />;`), ['prop:label', 'prop:hint']);
});

test('dialogs, option lists and text setters are reported', () => {
  assert.deepEqual(kinds(`function f() { Alert.alert('Error', 'No se pudo guardar'); }`), ['dialog:Alert.alert', 'dialog:Alert.alert']);
  assert.deepEqual(kinds(`function f() { showAlert('Sin conexión'); }`), ['dialog:showAlert']);
  assert.deepEqual(kinds(`const O = [{ label: 'Una hora', value: 1 }];`), ['object:label']);
  assert.deepEqual(kinds(`function f() { setError('No pudimos verificar'); }`), ['setter:setError']);
});

test('translated text, keys, brands, symbols, units and demo data are fine', () => {
  assert.equal(hits(`const A = () => <Text>{t('home.title')}</Text>;`).length, 0);
  assert.equal(hits(`const A = () => <TextInput placeholder={t('x.placeholder')} accessibilityLabel={t('x.label')} />;`).length, 0);
  assert.equal(hits(`const A = () => <Text>JChat</Text>;`).length, 0, 'brand');
  assert.equal(hits(`const A = () => <Text>Match</Text>;`).length, 0, 'product name');
  assert.equal(hits(`const A = () => <Text>{'• '}{count}</Text>;`).length, 0, 'symbols');
  assert.equal(hits(`const A = () => <Text>58 mm</Text>;`).length, 0, 'a unit');
  assert.equal(hits(`const A = () => <Text>$ 12.50 / 2</Text>;`).length, 0, 'numbers');
  assert.equal(hits(`const A = () => <Text>:)</Text>;`).length, 0);
  assert.equal(hits(`const A = () => <Text>🍷</Text>;`).length, 0, 'emoji');
  assert.equal(hits(`const STEPS = [{ title: 'tutorial.step1Title' }];`).length, 0, 'an i18n key');
  assert.equal(hits(`const DEMO_EVENTS = [{ name: 'Friday Night Live', description: 'Live music every Friday' }];`).length, 0, 'demo data');
  assert.equal(hits(`const A = () => <View testID="settings-back" style={{ flex: 1 }} key="row-1" />;`).length, 0, 'non-visible props');
});

test('i18n-ignore needs a reason and silences one site', () => {
  assert.equal(hits(`const A = () => <Text>Hola amigo</Text>; // i18n-ignore: legal text kept as is`).length, 0);
  assert.equal(hits(`// i18n-ignore: internal id\nconst O = [{ label: '1 hour' }];`).length, 0);
  assert.equal(hits(`const A = () => <Text>Hola amigo</Text>; // i18n-ignore:`).length, 1, 'no reason → still reported');
});

test('the whole app has no hard-coded visible text', () => {
  const found = scanProject(ROOT);
  const report = found.map((f) => `  ${f.file}:${f.line}  [${f.kind}]  ${f.text.slice(0, 90)}`).join('\n');
  assert.equal(found.length, 0, `hard-coded text (move it to i18n/locales/{es,en}/*.json and use t()):\n${report}`);
});

// ── es / en have the same keys, none empty ───────────────────────────────────────────────────────────────────────────

function flatten(obj, prefix = '') {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object') Object.assign(out, flatten(value, `${prefix}${key}.`));
    else out[`${prefix}${key}`] = value;
  }
  return out;
}
const PLURAL = /_(zero|one|two|few|many|other)$/;
const normalize = (keys) => new Set(keys.map((k) => k.replace(PLURAL, '')));

test('es and en have the same namespaces and keys, and no empty text', () => {
  const dir = (lang) => join(ROOT, 'i18n', 'locales', lang);
  const files = (lang) => readdirSync(dir(lang)).filter((f) => f.endsWith('.json')).sort();
  assert.deepEqual(files('es'), files('en'), 'the same namespaces in both languages');
  const problems = [];
  for (const file of files('es')) {
    const es = flatten(JSON.parse(readFileSync(join(dir('es'), file), 'utf8')));
    const en = flatten(JSON.parse(readFileSync(join(dir('en'), file), 'utf8')));
    const esKeys = normalize(Object.keys(es));
    const enKeys = normalize(Object.keys(en));
    for (const k of esKeys) if (!enKeys.has(k)) problems.push(`${file}: "${k}" is only in es`);
    for (const k of enKeys) if (!esKeys.has(k)) problems.push(`${file}: "${k}" is only in en`);
    for (const [lang, table] of [['es', es], ['en', en]]) {
      for (const [k, v] of Object.entries(table)) if (typeof v === 'string' && !v.trim()) problems.push(`${lang}/${file}: "${k}" is empty`);
    }
  }
  assert.deepEqual(problems, []);
});
