// The 21+ notice must appear right before paying wherever a product with id_required can be paid for:
// the cart and checkout (devices + Expo web), the gift (sheet + web pay page) and the Next.js menu checkout; texts in en and es.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const json = (p) => JSON.parse(read(p));

test('texts exist in en and es with the agreed wording', () => {
  assert.equal(json('mobile/i18n/locales/en/common.json').idRequiredNotice, 'Only for ages 21 and over. You will be asked for ID at the venue.');
  assert.equal(json('mobile/i18n/locales/es/common.json').idRequiredNotice, 'Solo para mayores de 21. Te pedirán identificación en el local.');
  assert.equal(json('web/messages/en.json').checkout.idNotice, 'Only for ages 21 and over. You will be asked for ID at the venue.');
  assert.equal(json('web/messages/es.json').checkout.idNotice, 'Solo para mayores de 21. Te pedirán identificación en el local.');
});

for (const [file, needle] of [
  ['mobile/screens/menu/CartScreen.tsx', /lines\.some\(\(l\) => l\.item\.id_required\) \? <IdRequiredNotice \/>/],
  ['mobile/screens/checkout/CheckoutScreen.tsx', /lines\.some\(\(l\) => l\.item\.id_required\) \? <IdRequiredNotice \/>/],
  ['mobile/components/gift/GiftSheet.tsx', /needsId \? <IdRequiredNotice \/>/],
  ['mobile/components/gift/GiftPayPage.web.tsx', /idRequired \? <IdRequiredNotice \/>/],
]) {
  test(`${file} shows the notice`, () => {
    assert.match(read(file), needle);
  });
}

test('the gift web page receives the flag from the sheet', () => {
  assert.match(read('mobile/components/gift/GiftSheet.tsx'), /idRequired=\{needsId\}/);
});

test('the Next.js menu reads id_required (read-only query), keeps it in the cart and shows the notice before Stripe', () => {
  assert.match(read('web/app/m/[slug]/page.tsx'), /stock_count, options, sort, id_required/);
  assert.match(read('web/app/m/[slug]/MenuPageClient.tsx'), /idRequired: item\.id_required === true/);
  assert.match(read('web/app/m/[slug]/CheckoutStep.tsx'), /cartItems\.some\(\(ci\) => ci\.idRequired\)/);
});
