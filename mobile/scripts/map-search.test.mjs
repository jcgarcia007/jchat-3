// The Map's business search: a pure filter over the businesses already loaded (name or category, no accents, no case, at most 8), debounced 150 ms, with
// a list under the search bar whose rows centre the map and open the business's card. Run from mobile/:  node --test scripts/map-search.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const js = ts.transpileModule(read('utils/mapSearch.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', js)(mod, mod.exports);
const { normalizeSearchText, matchesSearch, searchBusinesses, SEARCH_MAX_RESULTS, SEARCH_DEBOUNCE_MS } = mod.exports;

const BARS = [
  { id: '1', name: 'Bar XZX', category: 'Bar & Nightclub' },
  { id: '2', name: 'JChat Demo Lounge', category: 'Lounge' },
  { id: '3', name: 'Café Ñandú', category: 'Cafetería' },
  { id: '4', name: 'Taquería El Güero', category: 'Restaurante' },
];

test('constants: 8 rows, 150 ms', () => {
  assert.equal(SEARCH_MAX_RESULTS, 8);
  assert.equal(SEARCH_DEBOUNCE_MS, 150);
});

test('normalization: lowercase, no accents, collapsed spaces', () => {
  assert.equal(normalizeSearchText('  CAFÉ   Ñandú '), 'cafe nandu');
  assert.equal(normalizeSearchText('Güero'), 'guero');
  assert.equal(normalizeSearchText(null), '');
  assert.equal(normalizeSearchText(undefined), '');
});

test('matches by name, with any case and without accents', () => {
  assert.deepEqual(searchBusinesses(BARS, 'xzx').map((b) => b.id), ['1']);
  assert.deepEqual(searchBusinesses(BARS, 'Bar XZX').map((b) => b.id), ['1']);
  assert.deepEqual(searchBusinesses(BARS, 'cafe').map((b) => b.id), ['3']);
  assert.deepEqual(searchBusinesses(BARS, 'GUERO').map((b) => b.id), ['4']);
  assert.deepEqual(searchBusinesses(BARS, 'nandu').map((b) => b.id), ['3']);
});

test('matches by category too', () => {
  assert.deepEqual(searchBusinesses(BARS, 'nightclub').map((b) => b.id), ['1']);
  assert.deepEqual(searchBusinesses(BARS, 'restaurante').map((b) => b.id), ['4']);
  assert.deepEqual(searchBusinesses(BARS, 'bar').map((b) => b.id), ['1'], 'a name or a category, once each');
  assert.equal(matchesSearch({ name: 'Plaza', category: 'Cafetería' }, 'cafeter'), true);
});

test('one character is enough; an empty or blank query matches nothing', () => {
  assert.deepEqual(searchBusinesses(BARS, 'x').map((b) => b.id), ['1']);
  assert.ok(searchBusinesses(BARS, 'j').length >= 1);
  assert.deepEqual(searchBusinesses(BARS, ''), []);
  assert.deepEqual(searchBusinesses(BARS, '   '), []);
  assert.equal(matchesSearch(BARS[0], ''), false);
});

test('no match → empty list; a missing category does not crash', () => {
  assert.deepEqual(searchBusinesses(BARS, 'zzzz'), []);
  assert.deepEqual(searchBusinesses([{ name: 'Sin categoría', category: '' }], 'sin').length, 1);
});

test('at most 8 rows, in the order they came; the limit can be changed', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ id: String(i), name: `Bar ${i}`, category: 'Bar' }));
  const found = searchBusinesses(many, 'bar');
  assert.equal(found.length, 8);
  assert.deepEqual(found.map((b) => b.id), ['0', '1', '2', '3', '4', '5', '6', '7']);
  assert.equal(searchBusinesses(many, 'bar', 3).length, 3);
});

// ── Static checks on the screen ──────────────────────────────────────────────────

const screen = read('screens/map/MapScreen.tsx');

test('MapScreen filters with searchBusinesses over the loaded businesses (debounced); typing no longer filters the pins', () => {
  assert.match(screen, /from '\.\.\/\.\.\/utils\/mapSearch'/);
  assert.match(screen, /searchBusinesses\(businessesNow, debouncedQuery\)/);
  assert.match(screen, /setTimeout\(\(\) => setDebouncedQuery\(filters\.searchQuery\), SEARCH_DEBOUNCE_MS\)/);
  assert.doesNotMatch(screen, /filters\.searchQuery\.toLowerCase\(\)/);
  const pins = screen.slice(screen.indexOf('const filtered = useMemo('), screen.indexOf('const filtered = useMemo(') + 900);
  assert.doesNotMatch(pins, /searchQuery/, 'the pins (and the "N places" counter) follow the chips and advanced filters only');
});

test('choosing a result closes the keyboard and the list, centres the map on the business and opens its BusinessPreviewCard', () => {
  assert.match(screen, /const selectSearchResult = useCallback\(\(business: MapBusiness\) => \{/);
  const body = screen.slice(screen.indexOf('const selectSearchResult'), screen.indexOf('const selectSearchResult') + 700);
  assert.match(body, /Keyboard\.dismiss\(\)/);
  assert.match(body, /setSearchOpen\(false\)/);
  assert.match(body, /mapRef\.current\?\.animateToRegion\(/);
  assert.match(body, /setSelected\(business\)/);
  assert.match(screen, /<MapSearchResults[\s\S]*?onSelect=\{selectSearchResult\}/);
  assert.match(screen, /<BusinessPreviewCard/);
});

test('the list is closed by a tap outside (a backdrop under the filter panel) and by Cancelar in the field', () => {
  assert.match(screen, /testID="map-search-backdrop"/);
  assert.match(screen, /onPress=\{\(\) => \{[^}]*setSearchOpen\(false\)/);
  const panel = read('components/map/FilterPanel.tsx');
  assert.match(panel, /testID="map-search-cancel"/);
  assert.match(panel, /Keyboard\.dismiss\(\)/);
  assert.match(panel, /belowSearch/);
});

test('the list: rows with avatar, name, category and distance; "Sin resultados para «…»" when nothing matches; bgSurface; theme tokens only', () => {
  const list = read('components/map/MapSearchResults.tsx');
  assert.match(list, /BusinessAvatar/);
  assert.match(list, /testID="map-search-results"/);
  assert.match(list, /testID=\{`map-search-result-\$\{business\.id\}`\}/);
  assert.match(list, /t\('filterPanel\.searchNoResults', \{ query: query\.trim\(\) \}\)/);
  assert.match(list, /backgroundColor: c\.bgSurface/);
  assert.doesNotMatch(list, /#[0-9a-fA-F]{3,8}\b/);
  assert.equal(JSON.parse(read('i18n/locales/es/map.json')).filterPanel.searchNoResults, 'Sin resultados para «{{query}}»');
  assert.ok(JSON.parse(read('i18n/locales/en/map.json')).filterPanel.searchNoResults);
  assert.ok(JSON.parse(read('i18n/locales/en/map.json')).filterPanel.searchCancel);
  assert.equal(JSON.parse(read('i18n/locales/es/map.json')).filterPanel.searchCancel, 'Cancelar');
});
