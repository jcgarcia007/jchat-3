#!/usr/bin/env node
// JChat 3.0 — translation report. Compares Spanish and English in the app (mobile/i18n/locales/{en,es}/*.json, i18next: {{name}}) and in the
// web (web/messages/{en,es}.json, next-intl / ICU: {name}, {count, plural, …}) and prints, per language pair:
//   · keys missing in one language
//   · empty values
//   · values whose variables differ between languages ({{name}} / {name} / ICU arguments)
//   · values identical in both languages and long enough to be a sentence (probably an untranslated copy)
// and, for the app, how many texts are written by hand in components (mobile/scripts/i18n-hardcoded.mjs, the AST scanner).
//
//   node scripts/check-i18n.mjs            report; exit 1 if anything is missing, empty, mismatched or hand-written
//   node scripts/check-i18n.mjs --json     the same as JSON
//
// "Identical in both languages" is only a hint (names, units and brands are legitimately identical): it never fails the run; the
// ALLOW_IDENTICAL list below silences the known ones.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIN_SENTENCE = 18;
/** Keys (or key suffixes) that are the same in both languages on purpose. */
const ALLOW_IDENTICAL = [/\.brand/i, /\.appName$/, /Url$/, /\.email$/i, /\.phone$/i];

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

/** Variable names of a value: i18next {{name}} and ICU {name} / {count, plural, …}. */
function variables(value) {
  if (typeof value !== 'string') return [];
  const names = new Set();
  for (const m of value.matchAll(/\{\{\s*([\w.]+)\s*(?:,[^}]*)?\}\}/g)) names.add(m[1]);
  const icu = value.replace(/\{\{[^}]*\}\}/g, '');
  for (const m of icu.matchAll(/\{\s*(\w+)\s*(?:,|\})/g)) names.add(m[1]);
  return [...names].sort();
}

function comparePair(label, en, es) {
  const report = { label, missingInEs: [], missingInEn: [], empty: [], variableMismatch: [], identical: [] };
  for (const key of Object.keys(en)) if (!(key in es)) report.missingInEs.push(key);
  for (const key of Object.keys(es)) if (!(key in en)) report.missingInEn.push(key);
  for (const [lang, side] of [['en', en], ['es', es]]) {
    for (const [key, value] of Object.entries(side)) if (value === '' || value === null) report.empty.push(`${lang}:${key}`);
  }
  for (const key of Object.keys(en)) {
    if (!(key in es)) continue;
    const a = variables(en[key]).join(',');
    const b = variables(es[key]).join(',');
    if (a !== b) report.variableMismatch.push(`${key}  en{${a}} es{${b}}`);
    if (typeof en[key] === 'string' && en[key] === es[key] && en[key].length >= MIN_SENTENCE && /\s/.test(en[key]) && !ALLOW_IDENTICAL.some((r) => r.test(key))) {
      report.identical.push(key);
    }
  }
  return report;
}

const reports = [];

// App: one JSON per namespace
const appBase = join(ROOT, 'mobile', 'i18n', 'locales');
const enFiles = readdirSync(join(appBase, 'en')).filter((f) => f.endsWith('.json')).sort();
for (const file of enFiles) {
  const en = flatten(JSON.parse(readFileSync(join(appBase, 'en', file), 'utf8')));
  let es = {};
  try { es = flatten(JSON.parse(readFileSync(join(appBase, 'es', file), 'utf8'))); } catch { es = {}; }
  reports.push(comparePair(`app/${file}`, en, es));
}
for (const file of readdirSync(join(appBase, 'es')).filter((f) => f.endsWith('.json'))) {
  if (!enFiles.includes(file)) reports.push({ label: `app/${file}`, missingInEs: [], missingInEn: [`(whole file ${file} missing in en)`], empty: [], variableMismatch: [], identical: [] });
}

// Web: one JSON per language
const webBase = join(ROOT, 'web', 'messages');
try {
  const en = flatten(JSON.parse(readFileSync(join(webBase, 'en.json'), 'utf8')));
  const es = flatten(JSON.parse(readFileSync(join(webBase, 'es.json'), 'utf8')));
  reports.push(comparePair('web/messages', en, es));
} catch { /* no web messages in this checkout */ }

// Hand-written texts in the app's components
let hardcoded = [];
try {
  const scanner = await import(pathToFileURL(join(ROOT, 'mobile', 'scripts', 'i18n-hardcoded.mjs')).href);
  hardcoded = scanner.scanProject(join(ROOT, 'mobile'));
} catch (e) {
  hardcoded = [{ file: 'i18n-hardcoded.mjs', line: 0, text: `scanner not available: ${e.message}` }];
}

const problems = (r) => r.missingInEs.length + r.missingInEn.length + r.empty.length + r.variableMismatch.length;
const total = reports.reduce((n, r) => n + problems(r), 0) + hardcoded.length;

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ reports, hardcoded, problems: total }, null, 2));
} else {
  for (const r of reports) {
    if (problems(r) === 0 && r.identical.length === 0) continue;
    console.log(`\n${r.label}`);
    for (const [title, list] of [['missing in es', r.missingInEs], ['missing in en', r.missingInEn], ['empty', r.empty], ['different variables', r.variableMismatch], ['identical in en and es (hint only)', r.identical]]) {
      if (list.length) console.log(`  ${title} (${list.length}):\n    ${list.slice(0, 40).join('\n    ')}${list.length > 40 ? `\n    … ${list.length - 40} more` : ''}`);
    }
  }
  if (hardcoded.length) {
    console.log(`\nhand-written texts in components (${hardcoded.length}):`);
    for (const h of hardcoded.slice(0, 60)) console.log(`  ${h.file}:${h.line}  ${JSON.stringify(h.text ?? h.snippet ?? '')}`);
  }
  console.log(`\ni18n check: ${reports.length} file group(s), ${total} problem(s)${total === 0 ? ' — OK' : ''}`);
}
process.exit(total === 0 ? 0 : 1);
