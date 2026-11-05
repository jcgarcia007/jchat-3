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
    field: [16, 1.3, 1.6], label: [13, 1.3, 1.6], button: [16, 1.2, 1.3], compact: [14, 1.3, 1.4], caption: [12, 1.35, 1.4],
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

test('between the intro text and the first field, migrated screens use sectionGap (24)', () => {
  const expected = {
    'screens/auth/LoginScreen.tsx': /subtitle:\s*\{[^}]*marginBottom:\s*sectionGap/,
    'screens/auth/LoginEmailScreen.tsx': /firstField:\s*\{[^}]*marginTop:\s*sectionGap/,
    'screens/auth/RegisterStep1Screen.tsx': /subtitle:\s*\{[^}]*marginBottom:\s*sectionGap/,
    'screens/auth/RegisterStep2Screen.tsx': /subtitle:\s*\{[^}]*marginBottom:\s*sectionGap/,
    'screens/auth/ForgotPasswordScreen.tsx': /scroll:\s*\{[^}]*gap:\s*sectionGap/,
    'screens/auth/ResetPasswordScreen.tsx': /subtitle:\s*\{[^}]*marginBottom:\s*sectionGap/,
    'screens/auth/ConfirmAgeScreen.tsx': /subtitle:\s*\{[^}]*marginBottom:\s*sectionGap/,
    'screens/profile/EditProfileScreen.tsx': /form:\s*\{[^}]*marginTop:\s*sectionGap/,
  };
  for (const [f, re] of Object.entries(expected)) assert.match(read(f), re, `${f}: intro → first field is not sectionGap`);
});

test('the pending fields use FormField (username, date, bio, code)', () => {
  assert.match(read('screens/auth/RegisterStep2Screen.tsx'), /<FormField[\s\S]*?register\.usernameLabel/);
  assert.match(read('screens/auth/ConfirmAgeScreen.tsx'), /<FormField/);
  assert.match(read('screens/auth/ForgotPasswordScreen.tsx'), /<FormField[\s\S]*?forgotPassword\.codeLabel/);
  const ep = read('screens/profile/EditProfileScreen.tsx');
  assert.match(ep, /<FormField[\s\S]*?edit\.usernameLabel/);
  assert.match(ep, /<FormField[\s\S]*?edit\.bioLabel/);
  const ff = read('components/common/FormField.tsx');
  assert.match(ff, /left\?: React\.ReactNode/);
  assert.match(ff, /style,\n/);
});

// ── Second batch (B7b): the elements a Dynamic-Type matrix found broken ───────────────────────────────────────────
// Only the listed style blocks are checked (the rest of those screens migrate later): no numeric fontSize / lineHeight,
// no fixed `height:` (minHeight is fine), and margin / padding / gap on the 4-point grid (6 allowed).
function styleBlock(source, selector) {
  const m = source.match(new RegExp(`^( *)${selector}: \\{(.*?)(?:\\n\\1\\},|\\},?$)`, 'ms'));
  return m ? m[0] : null;
}
const GRID_RE = /\b(margin|marginTop|marginBottom|marginLeft|marginRight|marginHorizontal|marginVertical|marginStart|marginEnd|padding|paddingTop|paddingBottom|paddingLeft|paddingRight|paddingHorizontal|paddingVertical|paddingStart|paddingEnd|gap|rowGap|columnGap)\s*:\s*(-?\d+(?:\.\d+)?)\b/g;

for (const { file, styles } of targets.elements ?? []) {
  test(`B7b ${file}: ${styles.join(', ')} follow the type + spacing standard`, () => {
    const source = read(file);
    assert.match(source, /theme\/typography/, `${file} imports the type standard`);
    for (const name of styles) {
      const raw = styleBlock(source, name);
      assert.ok(raw, `style rule ${name} exists in ${file}`);
      const block = raw.replace(/shadowOffset:\s*\{[^}]*\}/g, ''); // a shadow offset is not a size
      assert.doesNotMatch(block, /\b(fontSize|lineHeight)\s*:\s*-?\d/, `${file} ${name}: numeric fontSize/lineHeight`);
      assert.doesNotMatch(block, /(?<![A-Za-z])height:/, `${file} ${name}: fixed height (use minHeight)`);
      for (const m of block.matchAll(GRID_RE)) {
        const v = Math.abs(Number(m[2]));
        assert.ok(v % 4 === 0 || v === 6, `${file} ${name}: ${m[0]} is off the 4-point grid`);
      }
    }
  });
}

test('B7b: the tab labels and the chips cap their text with typeCap, not a loose number', () => {
  const tab = read('components/navigation/NotchTabBar.tsx');
  // Bottom-bar labels barely grow (cap 1.2) and never shrink to fit: the five labels share one size.
  assert.match(tab, /const TAB_LABEL_CAP = 1\.2;/);
  assert.match(tab, /maxFontSizeMultiplier=\{TAB_LABEL_CAP\}/);
  assert.doesNotMatch(tab, /adjustsFontSizeToFit|minimumFontScale/);
  assert.doesNotMatch(tab, /maxFontSizeMultiplier=\{1\.\d+\}/);
  assert.match(read('screens/checkout/CheckoutScreen.tsx'), /tipChipText[\s\S]*?typeStyle\('caption'\)/);
  assert.match(read('screens/checkout/CheckoutScreen.tsx'), /tipRow: \{[^}]*flexWrap: 'wrap'/);
  assert.match(read('screens/settings/SettingsScreen.tsx'), /segmented: \{[^}]*flexWrap: 'wrap'/);
  assert.match(read('screens/match/MatchMyProfileScreen.tsx'), /optionRow: \{[^}]*flexWrap: 'wrap'/);
});

test('B7b: dense UI (14–15 before) uses the compact role with its own cap', () => {
  for (const [file, style] of [
    ['screens/match/MatchInterestsScreen.tsx', /chipText: \{ \.\.\.typeStyle\('compact'\)/],
    ['screens/match/MatchItsAMatchScreen.tsx', /chipText: \{ \.\.\.typeStyle\('compact'\)/],
    ['screens/match/MatchMyProfileScreen.tsx', /optionText: \{ \.\.\.typeStyle\('compact'\)/],
    ['components/map/BusinessPreviewCard.tsx', /btnMainLabel: \{\s*\.\.\.typeStyle\('compact'\)/],
    ['components/menu/CartBar.tsx', /total: \{[^}]*typeStyle\('compact'\)/],
  ]) {
    const src = read(file);
    assert.match(src, style, file);
    assert.match(src, /typeCap\('compact'\)/, file);
  }
});

// Amounts never split ("$19.0 / 0"): the amount is one line and keeps its width; the text next to it (a label or a
// button, which may wrap) is the one that gives way.
test('B7b: amounts next to a label or button stay on one line and never shrink', () => {
  const amountTexts = [
    ['screens/menu/ProductDetailScreen.tsx', ['addBarTotal', 'addBarUnit']],
    ['components/menu/CartBar.tsx', ['styles.total']],
    ['components/menu/ProductRow.tsx', ['styles.price,']],
    ['screens/menu/CartScreen.tsx', ['lineTotal', 'totalValue']],
    ['screens/checkout/CheckoutScreen.tsx', ['summaryItemPrice', 'totalValue,', 'totalValueBold']],
  ];
  for (const [file, names] of amountTexts) {
    const src = read(file);
    for (const name of names) {
      const tag = src.split('<Text').find((chunk) => chunk.includes(name) && chunk.split('>')[0].includes(name));
      assert.ok(tag, `${file}: no <Text> with ${name}`);
      assert.match(tag.split('>')[0], /numberOfLines=\{1\}/, `${file}: ${name} must be numberOfLines={1}`);
      assert.doesNotMatch(tag.split('>')[0], /adjustsFontSizeToFit/, `${file}: ${name} must not auto-shrink`);
    }
  }
  const style = (file, key) => {
    const m = read(file).match(new RegExp(`\\n  ${key}: \\{[^}]*\\}`));
    assert.ok(m, `${file}: no style ${key}`);
    return m[0];
  };
  for (const [file, key] of [
    ['screens/menu/ProductDetailScreen.tsx', 'addBarPrice'],
    ['components/menu/CartBar.tsx', 'total'],
    ['components/menu/ProductRow.tsx', 'price'],
    ['screens/menu/CartScreen.tsx', 'lineTotal'],
    ['screens/menu/CartScreen.tsx', 'totalValue'],
    ['screens/checkout/CheckoutScreen.tsx', 'summaryItemPrice'],
    ['screens/checkout/CheckoutScreen.tsx', 'totalValue'],
    ['screens/checkout/CheckoutScreen.tsx', 'totalValueBold'],
  ]) assert.match(style(file, key), /flexShrink: 0/, `${file}: ${key} keeps its width`);
  // The things beside the amount can give way.
  assert.match(style('screens/menu/ProductDetailScreen.tsx', 'addButton'), /flexShrink: 1/);
  assert.doesNotMatch(style('screens/menu/ProductDetailScreen.tsx', 'addButton'), /minWidth/);
  assert.match(style('screens/menu/CartScreen.tsx', 'totalLabel'), /flexShrink: 1/);
  assert.match(style('screens/checkout/CheckoutScreen.tsx', 'totalLabel'), /flexShrink: 1/);
  assert.match(style('screens/checkout/CheckoutScreen.tsx', 'totalLabelBold'), /flexShrink: 1/);
  assert.match(style('components/menu/ProductRow.tsx', 'fromLabel'), /flexShrink: 1/);
});
