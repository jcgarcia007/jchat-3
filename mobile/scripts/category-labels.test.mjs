// H-026: the registration categories are shown translated; unknown free text is shown as written; filtering still compares the normalized key.
// Run from mobile/:  node --test scripts/category-labels.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const js = ts.transpileModule(read('utils/categories.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', js)(mod, mod.exports);
const { categoryLabel, categoryLabelKey, normalizeCategory, categoryMatches, buildCategoryOptions } = mod.exports;

const REGISTRATION = ['Bar & Nightclub', 'Restaurant', 'Café', 'Lounge', 'Club', 'Brewery', 'Rooftop Bar', 'Sports Bar', 'Cocktail Bar', 'Wine Bar', 'Other'];
const bundle = (lang) => JSON.parse(read(`i18n/locales/${lang}/map.json`)).categories;

test('every option of the registration list has a key present in es and en', () => {
  for (const option of REGISTRATION) {
    const key = categoryLabelKey(option);
    assert.ok(key, option);
    const leaf = key.replace('categories.', '');
    assert.ok(bundle('es')[leaf], `es ${leaf}`);
    assert.ok(bundle('en')[leaf], `en ${leaf}`);
  }
  assert.deepEqual(Object.keys(bundle('es')).sort(), Object.keys(bundle('en')).sort());
});

test('known categories are translated (case and accents do not matter); unknown text is shown as written', () => {
  const t = (lang) => (key) => bundle(lang)[key.replace('categories.', '')];
  assert.equal(categoryLabel('Bar & Nightclub', t('es')), 'Bar y discoteca');
  assert.equal(categoryLabel('other', t('es')), 'Otro');
  assert.equal(categoryLabel('Restaurant', t('es')), 'Restaurante');
  assert.equal(categoryLabel(' CAFE ', t('en')), 'Café');
  assert.equal(categoryLabel('Taquería de barrio', t('es')), 'Taquería de barrio');
  assert.equal(categoryLabel(null, t('es')), '');
});

test('filtering is unchanged: it compares the normalized key, not the label', () => {
  assert.equal(categoryMatches('Bar & Nightclub', normalizeCategory('Bar & Nightclub')), true);
  assert.equal(categoryMatches('Bar', 'bar & nightclub'), false);
  assert.deepEqual(buildCategoryOptions(['Café', 'cafe', 'Other']).map((o) => o.key), ['cafe', 'other']);
});

test('the places that show a category go through categoryLabel', () => {
  for (const file of ['components/map/FilterPanel.tsx', 'components/map/BusinessPreviewCard.tsx', 'components/map/MapSearchResults.tsx', 'components/nearby/BusinessCard.tsx', 'components/nearby/NearbyFilters.tsx']) {
    assert.match(read(file), /categoryLabel\(/, file);
  }
});
