// Match v2 polish: the entry sheet is fully in ONE language (the selector's), the photo dialog uses existing keys, a photo in review refreshes by
// itself, and every view's progress label comes from the same summary. Run from mobile/:
//   node --test scripts/match-v2-polish.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const json = (lang, ns) => JSON.parse(read(`i18n/locales/${lang}/${ns}.json`));
const has = (obj, key) => {
  const node = key.split('.').reduce((acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined), obj);
  if (node !== undefined) return true;
  const parent = key.split('.').slice(0, -1).reduce((acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined), obj);
  const leaf = key.split('.').pop();
  return Boolean(parent && typeof parent === 'object' && (`${leaf}_one` in parent || `${leaf}_other` in parent));
};

const js = ts.transpileModule(read('utils/matchProfileState.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', js)(mod, mod.exports);
const { shouldPollPhotos, progressCounts, summarizeMatchProfile, PHOTO_POLL_MS, PHOTO_POLL_MAX_MS } = mod.exports;

const chatRoom = read('screens/chat/ChatRoomScreen.tsx');
const notice = read('components/match/MatchEntryNotice.tsx');
const incognito = read('components/chat/IncognitoToggle.tsx');
const myProfile = read('screens/match/MatchMyProfileScreen.tsx');
const hook = read('hooks/useMyMatchProfile.ts');

/** The pre-entry sheet in ChatRoomScreen: from `if (entryVisible)` to the placeholder behind the modal. */
const sheet = chatRoom.slice(chatRoom.indexOf('  if (entryVisible) {'), chatRoom.indexOf('{/* Background placeholder behind modal */}'));
const GLOBAL_T = /(?<![\w.$])(t|tc|tPos)\(/;

// ── A: the sheet's texts all use a t fixed to the sheet's language ─────────────────────────────────────────────

test('MatchEntryNotice never uses the global t: it takes the sheet language and fixes t to it', () => {
  assert.doesNotMatch(notice, /const \{[^}]*\bt\b[^}]*\} = useTranslation/, 'no t from useTranslation');
  assert.match(notice, /i18n\.getFixedT\(language, 'match'\)/);
  // every t( call in the file is the fixed one: it is declared with useMemo from getFixedT.
  assert.match(notice, /const t = useMemo\(\(\) => i18n\.getFixedT/);
});

test('the entry sheet in ChatRoomScreen calls no global t / tc / tPos', () => {
  assert.ok(sheet.length > 500, 'the sheet source was found');
  const offenders = sheet.split('\n').filter((line) => GLOBAL_T.test(line) && !/^\s*(\/\/|\*|\{\/\*)/.test(line));
  assert.deepEqual(offenders, [], `global t in the sheet:\n${offenders.join('\n')}`);
  assert.match(chatRoom, /const gt = useMemo\(\(\) => i18n\.getFixedT\(sheetLang, 'chat'\)/);
  assert.match(chatRoom, /const gtMatch = useMemo\(\(\) => i18n\.getFixedT\(sheetLang, 'match'\)/);
  assert.match(chatRoom, /const gtCommon = useMemo\(\(\) => i18n\.getFixedT\(sheetLang, 'common'\)/);
  // the sheet's language never touches the app's language
  assert.doesNotMatch(chatRoom, /i18n\.changeLanguage\(sheetLang/);
  assert.doesNotMatch(notice, /changeLanguage/);
});

test('the incognito toggle inside the sheet receives the sheet t', () => {
  assert.match(sheet, /<IncognitoToggle[\s\S]*?t=\{gt\}/);
  assert.match(incognito, /t: tProp/);
  assert.match(incognito, /const t = tProp \?\? globalT/);
});

test('the ES / EN selector is top-right of the venue-name row, >= 44 pt, with its own label', () => {
  assert.match(sheet, /gateStyles\.titleWrap/);
  assert.match(sheet, /gateStyles\.langSlot/);
  assert.match(sheet, /<LanguageSelector value=\{sheetLang\} onChange=\{setSheetLang\} label=\{gtMatch\('entry\.langA11y'\)\}/);
  assert.match(chatRoom, /langSlot: \{ position: 'absolute', right: 0, top: 0 \}/);
  assert.match(notice, /langBtn: \{ minWidth: 44, minHeight: 44/);
  assert.doesNotMatch(notice, /<LanguageSelector/, 'the selector no longer sits in the middle of the notice');
  assert.equal(json('es', 'match').entry.langA11y, 'Idioma de esta hoja');
  assert.equal(json('en', 'match').entry.langA11y, 'Language of this sheet');
});

test('every key the sheet asks for exists in es and en (the language switch never falls back to a key)', () => {
  const chat = { es: json('es', 'chat'), en: json('en', 'chat') };
  const match = { es: json('es', 'match'), en: json('en', 'match') };
  const common = { es: json('es', 'common'), en: json('en', 'common') };
  const missing = [];
  for (const [re, ns] of [[/gt\('([\w.]+)'/g, chat], [/gtMatch\('([\w.]+)'/g, match], [/gtCommon\('([\w.]+)'/g, common]]) {
    for (const [, key] of sheet.matchAll(re)) for (const lang of ['es', 'en']) if (!has(ns[lang], key)) missing.push(`${lang}:${key}`);
  }
  for (const [, key] of notice.matchAll(/\bt\('([\w.]+)'/g)) for (const lang of ['es', 'en']) if (!has(match[lang], key)) missing.push(`${lang}:match.${key}`);
  assert.deepEqual(missing, []);
});

// ── B: the photo dialog uses keys that exist ─────────────────────────────────────────────────────────────

test('copyProfilePhoto exists in es and en, and every literal key of "Mi perfil de Match" exists in both', () => {
  assert.equal(json('es', 'match').profile.photos.copyProfilePhoto, 'Usar mi foto de perfil');
  assert.equal(json('en', 'match').profile.photos.copyProfilePhoto, 'Use my profile photo');
  const missing = [];
  for (const [, key] of myProfile.matchAll(/(?<![\w.$])t\('([\w.]+)'/g)) {
    for (const lang of ['es', 'en']) if (!has(json(lang, 'match'), key)) missing.push(`${lang}:${key}`);
  }
  // keys passed as a value (run(..., 'profile.photos.uploadError')) are resolved with t(errorKey): check them too
  for (const [, key] of myProfile.matchAll(/'(profile\.photos\.\w+Error)'/g)) {
    for (const lang of ['es', 'en']) if (!has(json(lang, 'match'), key)) missing.push(`${lang}:${key}`);
  }
  assert.deepEqual(missing, []);
});

// ── C: a photo in review refreshes by itself ─────────────────────────────────────────────────────────────

test('photos in review are polled every 5 s for at most 2 minutes', () => {
  assert.equal(PHOTO_POLL_MS, 5000);
  assert.equal(PHOTO_POLL_MAX_MS, 120000);
  assert.equal(shouldPollPhotos(0, 1000), false, 'nothing pending: no polling');
  assert.equal(shouldPollPhotos(1, 0), true);
  assert.equal(shouldPollPhotos(2, 119999), true);
  assert.equal(shouldPollPhotos(1, 120000), false, 'gives up after 2 minutes');
  assert.equal(shouldPollPhotos(1, -1), false);
});

test('the hook polls only while focused, and the profile screen no longer has its own poll', () => {
  assert.match(hook, /setInterval\([\s\S]*shouldPollPhotos\(pendingRef\.current/);
  assert.match(hook, /return \(\) => clearInterval\(timer\)/);
  assert.doesNotMatch(myProfile, /REVIEW_POLL_MS|setInterval/);
});

// ── D: one summary for every progress text ───────────────────────────────────────────────────────────────

test('the progress label is built from the summary in the edit, complete and preview views', () => {
  assert.match(myProfile, /const progressA11y = t\('profile\.v2\.progressA11y', progressCounts\(summary\)\)/);
  const uses = myProfile.match(/progressA11y/g) ?? [];
  assert.ok(uses.length >= 4, 'declared once and used in edit, complete and preview');
  assert.doesNotMatch(myProfile, /progressA11y', \{ done: (?!summary)/);
  const full = summarizeMatchProfile({ gender: 'man', seeking: 'women', photos: [{ status: 'approved' }, { status: 'approved' }] });
  assert.deepEqual(progressCounts(full), { done: 4, total: 4 });
  const es = json('es', 'match').profile.v2.progressA11y.replace('{{done}}', full.done).replace('{{total}}', full.total);
  assert.equal(es, 'Perfil: 4 de 4 pasos');
});
