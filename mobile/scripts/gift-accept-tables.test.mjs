// R1: accepting a gift without the keyboard — the venue's tables as buttons (migration 241 + GiftCard's accept sheet).
// Run from mobile/:  node --test scripts/gift-accept-tables.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'gift-tables-'));
writeFileSync(join(dir, 'tableLabels.mjs'), ts.transpileModule(read('utils/tableLabels.ts'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
const { sortTableLabels, normalizeTableLabel, defaultTableLabel } = await import(pathToFileURL(join(dir, 'tableLabels.mjs')).href);

test('sortTableLabels: natural order (T10 after T9, not after T1), labels without a number last', () => {
  assert.deepEqual(sortTableLabels(['T10', 'T2', 'T1', 'T9', 'T3']), ['T1', 'T2', 'T3', 'T9', 'T10']);
  assert.deepEqual(sortTableLabels(['T1', 'T10', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9']), ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10']);
  assert.deepEqual(sortTableLabels(['Barra', 'Mesa 12', 'Terraza', 'Mesa 2']), ['Mesa 2', 'Mesa 12', 'Barra', 'Terraza']);
  // same number: by text, case-insensitive first
  assert.deepEqual(sortTableLabels(['b2', 'A2', 'T2']), ['A2', 'b2', 'T2']);
  // the first 9 digits of the first run: a long label does not overflow or break the order
  assert.deepEqual(sortTableLabels(['T123456789012', 'T5']), ['T5', 'T123456789012']);
});

test('sortTableLabels does not mutate its input and keeps duplicates', () => {
  const input = ['T2', 'T1'];
  const out = sortTableLabels(input);
  assert.deepEqual(input, ['T2', 'T1']);
  assert.deepEqual(out, ['T1', 'T2']);
  assert.deepEqual(sortTableLabels([]), []);
  assert.deepEqual(sortTableLabels(['T1', 'T1']), ['T1', 'T1']);
});

test('normalizeTableLabel drops a mesa / table / t prefix like the server does', () => {
  for (const raw of ['7', 'T7', 't 7', 'mesa 7', 'Mesa7', 'Table 7', ' 7 ']) assert.equal(normalizeTableLabel(raw), '7', raw);
});

test('defaultTableLabel: the only table, else the entry table when it is in the list, else nothing', () => {
  assert.equal(defaultTableLabel(['T4'], null), 'T4');
  assert.equal(defaultTableLabel(['T4'], 'T9'), 'T4', 'a single table wins');
  assert.equal(defaultTableLabel(['T1', 'T2', 'T3'], 'T2'), 'T2');
  assert.equal(defaultTableLabel(['T1', 'T2', 'T3'], 't2'), 'T2');
  assert.equal(defaultTableLabel(['T1', 'T2', 'T3'], 'mesa 3'), 'T3');
  assert.equal(defaultTableLabel(['T1', 'T2', 'T3'], '3'), 'T3');
  assert.equal(defaultTableLabel(['T1', 'T2', 'T3'], 'T7'), null);
  assert.equal(defaultTableLabel(['T1', 'T2', 'T3'], undefined), null);
  assert.equal(defaultTableLabel(['T1', 'T2'], ''), null);
  assert.equal(defaultTableLabel([], 'T1'), null);
});

test('listVenueTableLabels calls the 241 function with the business and falls back to an empty list', () => {
  const svc = read('services/giftOffers.ts');
  assert.match(svc, /import \{ sortTableLabels \} from '\.\.\/utils\/tableLabels';/);
  assert.match(svc, /supabase\.rpc\('venue_table_labels' as never, \{ p_business_id: businessId \} as never\)/);
  assert.match(svc, /if \(error \|\| !Array\.isArray\(data\)\) return \[\];/);
  assert.match(svc, /return sortTableLabels\(labels\);/);
});

test('the accept sheet: 5-column grid of 48 px buttons, preselection, "not listed" link, manual field attributes, button label', () => {
  const card = read('components/gift/GiftCard.tsx');
  assert.match(card, /const TABLE_COLUMNS = 5;\s*const TABLE_GAP = 8;/);
  assert.match(card, /tableGrid: \{ flexDirection: 'row', flexWrap: 'wrap', gap: TABLE_GAP \}/);
  assert.match(card, /tableCell: \{ minHeight: 48,/);
  // selected = brandFill + white text; the rest bgSurface with a borderSubtle border (theme tokens only)
  assert.match(card, /borderColor: c\.borderSubtle, backgroundColor: selected \? c\.brandFill : c\.bgSurface/);
  assert.match(card, /color: selected \? palette\.onBrand : c\.textPrimary/);
  assert.match(card, /color: c\.brandText \}\]\}>\{t\('giftCard\.tableNotListed'\)\}/);
  // preselection: the entry table of the session of THIS venue, or the only table
  assert.match(card, /const entryTable = session\?\.businessId === view\.business_id \? session\.tableLabel : undefined;/);
  assert.match(card, /setPicked\(defaultTableLabel\(list, entryTable\)\);/);
  // the number field: numeric keypad, "done", no autofill (react-native-web writes autocomplete="off")
  assert.match(card, /inputMode="numeric"\s*enterKeyHint="done"\s*autoComplete="off"/);
  // an empty list shows the field directly, as before; the optional details appear with the number field only, on EVERY platform
  // (web, iOS and Android alike): tapping a table never opens the keyboard
  assert.match(card, /const showManual = labels !== null && \(labels\.length === 0 \|\| notListed\);/);
  assert.match(card, /const showDetails = showManual;/);
  assert.doesNotMatch(card, /const showDetails = Platform/);
  // the main button: "Aceptar regalo · Mesa {label}", disabled with no table
  assert.match(card, /disabled=\{sending \|\| !tableValue\}/);
  assert.match(card, /tableValue \? t\('giftCard\.acceptWithTable', \{ label: tableValue \}\) : t\('giftCard\.confirmAccept'\)/);
  assert.match(card, /respondGiftOffer\(view\.id, true, tableValue, showDetails \? details : ''\)/);
  // no hex in the new code
  assert.doesNotMatch(card.slice(card.indexOf('function GiftAcceptSheet')), /#[0-9a-fA-F]{3,8}\b/);
});

test('texts: the same keys in es and en', () => {
  const j = (lng) => JSON.parse(read(`i18n/locales/${lng}/chat.json`)).giftCard;
  assert.equal(j('es').acceptWithTable, 'Aceptar regalo · Mesa {{label}}');
  assert.equal(j('en').acceptWithTable, 'Accept gift · Table {{label}}');
  assert.ok(j('es').tableNotListed && j('en').tableNotListed);
  assert.deepEqual(Object.keys(j('es')).sort(), Object.keys(j('en')).sort(), 'same giftCard keys in both languages');
});

test('migration 241 returns only labels, only for a signed-in person inside the venue, and is not public', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/241_venue_table_labels.sql', import.meta.url), 'utf8');
  assert.match(sql, /returns table \(label text\)/);
  assert.match(sql, /auth\.uid\(\) is not null/);
  assert.match(sql, /public\.venue_presence_ok\(p_business_id, auth\.uid\(\)\)/);
  assert.match(sql, /revoke all on function public\.venue_table_labels\(uuid\) from public, anon;/);
  assert.match(sql, /grant execute on function public\.venue_table_labels\(uuid\) to authenticated;/);
  const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(code, /qr_token|short_code|access_code/, 'never selects a table token or code');
});
