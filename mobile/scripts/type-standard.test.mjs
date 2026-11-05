// The type + spacing standard (B7). Run from mobile/:  node --test scripts/type-standard.test.mjs
// Migrated screens take sizes and rhythms from theme/typography.ts and theme/spacing.ts: no loose numeric fontSize /
// lineHeight, no margin / padding / gap off the 4-point grid (6 = fieldLabelGap is allowed), no tracking outside `label`.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const targets = JSON.parse(read('scripts/type-standard-targets.json'));

async function load(rel) {
  const dir = mkdtempSync(join(tmpdir(), 'tstd-'));
  const file = join(dir, rel.replace(/.*\//, '').replace(/\.ts$/, '.mjs'));
  writeFileSync(file, ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
  return import(pathToFileURL(file).href);
}
const typo = await load('theme/typography.ts');
const spacing = await load('theme/spacing.ts');

test('the role table is exactly the agreed standard', () => {
  const expected = {
    display: [32, 1.15, 1.3], title: [24, 1.2, 1.3], headline: [18, 1.3, 1.4], body: [16, 1.4, 1.6],
    field: [16, 1.3, 1.6], label: [13, 1.3, 1.6], button: [16, 1.2, 1.3], caption: [12, 1.35, 1.4],
  };
  assert.deepEqual(Object.keys(typo.TYPE_ROLES).sort(), Object.keys(expected).sort());
  for (const [role, [size, ratio, cap]] of Object.entries(expected)) {
    assert.deepEqual(typo.TYPE_ROLES[role], { fontSize: size, lineHeightRatio: ratio, cap }, role);
  }
});

test('lineHeight is always a proportion of the size; tracking and uppercase only on label', () => {
  for (const role of Object.keys(typo.TYPE_ROLES)) {
    const s = typo.typeStyle(role);
    assert.equal(s.lineHeight, Math.round(s.fontSize * typo.TYPE_ROLES[role].lineHeightRatio), role);
    if (role === 'label') {
      assert.equal(s.textTransform, 'uppercase');
      assert.ok(s.letterSpacing > 0);
    } else {
      assert.equal(s.letterSpacing, undefined, role);
      assert.equal(s.textTransform, undefined, role);
    }
  }
});

test('the spacing standard: 4-point grid and the form rhythm', () => {
  assert.deepEqual(spacing.space, { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 40 });
  assert.equal(spacing.fieldLabelGap, 6);
  assert.equal(spacing.fieldGap, 16);
  assert.equal(spacing.sectionGap, 24);
  assert.equal(spacing.controlMinHeight, 48);
});

test('FormField: label and field share the cap, the input is at least 48 high and the gaps are the standard', () => {
  assert.equal(typo.TYPE_ROLES.label.cap, typo.TYPE_ROLES.field.cap);
  const ff = read('components/common/FormField.tsx');
  assert.match(ff, /variant="label"/);
  assert.match(ff, /maxFontSizeMultiplier=\{typeCap\('field'\)\}/);
  assert.match(ff, /minHeight: controlMinHeight/);
  assert.match(ff, /marginTop: fieldGap/);
  assert.match(ff, /marginBottom: fieldLabelGap/);
});

test('AppText applies the role cap unless the caller sets one', () => {
  const at = read('components/common/AppText.tsx');
  assert.match(at, /maxFontSizeMultiplier \?\? typeCap\(variant\)/);
  assert.match(at, /typeStyle\(variant\)/);
});

const files = [...targets.migrated, ...targets.standardFiles];
const isCode = (line) => !/^\s*(\/\/|\*|\/\*)/.test(line);

test('migrated files have no numeric fontSize or lineHeight (all from typography.ts)', () => {
  const hits = [];
  for (const f of targets.migrated) {
    read(f).split('\n').forEach((line, i) => {
      if (isCode(line) && /\b(fontSize|lineHeight)\s*:\s*-?\d/.test(line)) hits.push(`${f}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(hits, []);
});

test('migrated files keep margin, padding and gap on the 4-point grid (6 allowed: fieldLabelGap)', () => {
  const re = /\b(margin|marginTop|marginBottom|marginLeft|marginRight|marginHorizontal|marginVertical|marginStart|marginEnd|padding|paddingTop|paddingBottom|paddingLeft|paddingRight|paddingHorizontal|paddingVertical|paddingStart|paddingEnd|gap|rowGap|columnGap)\s*:\s*(-?\d+(?:\.\d+)?)\b/g;
  const hits = [];
  for (const f of targets.migrated) {
    read(f).split('\n').forEach((line, i) => {
      if (!isCode(line)) return;
      for (const m of line.matchAll(re)) {
        const v = Math.abs(Number(m[2]));
        if (!(v % 4 === 0 || v === 6)) hits.push(`${f}:${i + 1}: ${m[0]}`);
      }
    });
  }
  assert.deepEqual(hits, []);
});

test('only the label role tracks (letterSpacing) in migrated files, unless the line is marked decoration', () => {
  const hits = [];
  for (const f of targets.migrated) {
    read(f).split('\n').forEach((line, i) => {
      if (isCode(line) && /\bletterSpacing\s*:/.test(line) && !/decoration/i.test(line)) hits.push(`${f}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(hits, []);
});

test('migrated screens use the standard components or roles', () => {
  for (const f of targets.migrated) {
    const src = read(f);
    assert.match(src, /AppText|FormField|typeStyle|theme\/typography/, `${f} does not use the type standard`);
  }
  void files;
});
