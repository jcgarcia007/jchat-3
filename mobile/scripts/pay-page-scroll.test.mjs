// JChat 3.0 — the gift payment page with the keyboard open: the summary folds to its total line while a card field is focused, and the page
// scrolls so that the card field AND the Pay button are above the keyboard and its autofill bar when they fit; when they do not, the focused field wins.
// Run: node --test scripts/pay-page-scroll.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'pay-scroll-'));
writeFileSync(join(dir, 'payPageScroll.mjs'), ts.transpileModule(read('utils/payPageScroll.ts'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
const { planReveal } = await import(pathToFileURL(join(dir, 'payPageScroll.mjs')).href);

// 390 × 844 phone, keyboard 336 → visible 508; scroller from y = 56 (header) to 508; autofill room 56; air 8.
const base = { viewTop: 56, viewBottom: 508, room: 56, margin: 8 };

test('everything already fits above the keyboard: do not move', () => {
  assert.deepEqual(planReveal({ ...base, cardTop: 140, payBottom: 400 }), { mode: 'none', delta: 0 });
});

test('form + Pay fit but Pay is under the autofill bar: scroll down just enough to bring Pay to the limit', () => {
  const plan = planReveal({ ...base, cardTop: 200, payBottom: 560 });   // limit = 452 → 108 px too low
  assert.equal(plan.mode, 'both');
  assert.equal(plan.delta, 108);
  // after scrolling the field is still below the top line, so both are visible
  assert.ok(200 - plan.delta >= base.viewTop + base.margin);
  assert.ok(560 - plan.delta <= base.viewBottom - base.room);
});

test('form + Pay fit but the field is above the top (scrolled too far): scroll back up so the field is visible, Pay stays above the limit', () => {
  const plan = planReveal({ ...base, cardTop: 20, payBottom: 300 });
  assert.equal(plan.mode, 'both');
  assert.equal(plan.delta, 20 - (56 + 8));            // negative: up
  assert.ok(300 - plan.delta <= base.viewBottom - base.room);
});

test('form + Pay do NOT fit: the focused field has priority — it goes to the top, Pay is left below', () => {
  const plan = planReveal({ ...base, cardTop: 250, payBottom: 700 });   // 450 px of form in 388 px of room
  assert.equal(plan.mode, 'field');
  assert.equal(plan.delta, 250 - (56 + 8));
  assert.equal(250 - plan.delta, 64, 'the field lands just under the header');
});

test('the boundary: exactly fitting counts as fitting', () => {
  const room = base.viewBottom - base.room - (base.viewTop + base.margin);   // 388
  const plan = planReveal({ ...base, cardTop: 300, payBottom: 300 + room });
  assert.equal(plan.mode, 'both');
  assert.equal(300 - plan.delta, base.viewTop + base.margin);
  assert.equal(300 + room - plan.delta, base.viewBottom - base.room);
});

test('a Chrome iOS bottom toolbar (visible area 90 px shorter) just means a smaller viewBottom: the same rules apply', () => {
  const tight = { ...base, viewBottom: 508 - 90 };
  assert.equal(planReveal({ ...tight, cardTop: 150, payBottom: 380 }).mode, 'both');   // Pay would be under the limit (362): comes up
  assert.equal(planReveal({ ...tight, cardTop: 150, payBottom: 560 }).mode, 'field');  // 410 px in 298 px: the field wins
});

test('the form scrolls with planReveal on the scroller, the card field and Pay come from refs, and the delta is applied with scrollBy', () => {
  const form = read('components/gift/GiftPaymentForm.web.tsx');
  assert.match(form, /planReveal\(\{[\s\S]*?cardTop: card\.getBoundingClientRect\(\)\.top,[\s\S]*?payBottom: pay\.getBoundingClientRect\(\)\.bottom,[\s\S]*?room: AUTOFILL_BAR_ROOM,[\s\S]*?margin: FIELD_TOP_MARGIN,[\s\S]*?\}\);/);
  assert.match(form, /scroller\.scrollBy\(\{ top: plan\.delta, behavior: 'smooth' \}\)/);
  assert.match(form, /const AUTOFILL_BAR_ROOM = 56;/);
  assert.match(form, /<View ref=\{cardRef\} testID="gift-card-field">\s*<PaymentElement options=\{CARD_ONLY_OPTIONS\} onFocus=\{revealForm\} onBlur=\{releaseForm\} \/>/);
  assert.match(form, /ref=\{payRef as unknown as React\.Ref<View>\}\s+testID="gift-pay"/);
});

test('focus folds the summary and blur unfolds it after a short wait that the next focus cancels (moving between card fields)', () => {
  const form = read('components/gift/GiftPaymentForm.web.tsx');
  const reveal = form.slice(form.indexOf('const revealForm'), form.indexOf('const releaseForm'));
  assert.match(reveal, /if \(blurTimer\.current\) clearTimeout\(blurTimer\.current\);\s+onCardFocusChange\?\.\(true\);/);
  const release = form.slice(form.indexOf('const releaseForm'), form.indexOf('const [paying'));
  assert.match(release, /setTimeout\(\(\) => onCardFocusChange\?\.\(false\), 250\)/);
  const page = read('components/gift/GiftPayPage.web.tsx');
  assert.match(page, /const \[folded, setFolded\] = useState\(false\);/);
  assert.match(page, /onCardFocusChange=\{setFolded\}/);
  assert.match(page, /\{folded \? null : <Text style=\{\[styles\.summaryItems/);
  assert.match(page, /\{folded \? null : <Text style=\{\[styles\.summaryMeta/);
  // the total line stays in both states
  assert.match(page, /<View style=\{\[styles\.totalRow, folded && styles\.totalRowFolded\]\}>/);
});

test('the shared props type carries onCardFocusChange; the native twin still renders nothing', () => {
  assert.match(read('components/gift/GiftPaymentForm.tsx'), /onCardFocusChange\?: \(focused: boolean\) => void;/);
  assert.match(read('components/gift/GiftPaymentForm.tsx'), /export function GiftPaymentForm\(_props: GiftPaymentFormProps\): null \{\s+return null;/);
});
