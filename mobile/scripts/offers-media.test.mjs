// Offers: the photos of the posts are 4:3 (centred crop in the list, the whole photo in the viewer), the offer cards have no photo, and "Ver local" opens
// the business card instead of the chat. Static checks. Run from mobile/:  node --test scripts/offers-media.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const post = read('components/megaphone/MegaphonePostCard.tsx');
const offer = read('components/megaphone/MegaphoneOfferCard.tsx');

test('the post card photo is 4:3 (height = round(width * 3 / 4)), cropped from the centre; the skeleton has the same box; nothing is left at 5/4', () => {
  const heights = [...post.matchAll(/const mediaHeight = Math\.round\(\(mediaWidth \* (\d)\) \/ (\d)\);/g)].map((m) => `${m[1]}/${m[2]}`);
  assert.deepEqual(heights, ['3/4', '3/4'], 'the card and its skeleton');
  assert.doesNotMatch(post, /mediaWidth \* 5\) \/ 4/);
  assert.match(post, /resizeMode="cover"/);
  assert.match(post, /<Skeleton width=\{mediaWidth\} height=\{mediaHeight\}/);
});

test('a tap on a photo opens the viewer on THAT photo with all of the post\'s photos (an image button)', () => {
  assert.match(post, /onPress=\{\(\) => setViewerIndex\(index\)\}/);
  assert.match(post, /accessibilityRole="imagebutton"/);
  assert.match(post, /<ImageViewerModal visible uris=\{item\.media_urls\} initialIndex=\{viewerIndex\}/);
});

test('the offer card has no photo block (offers carry no media) and does not change', () => {
  assert.doesNotMatch(offer, /Image|media_urls|mediaHeight/);
});

// ── "Ver local" ────────────────────────────────────────────────────────────────

const offers = read('screens/offers/OffersScreen.tsx');

test('onEnter opens the business card (BusinessCardSheet → BusinessPreviewCard) and no longer navigates to ChatRoom from Offers', () => {
  assert.match(offers, /const viewVenue = useCallback\(async \(item: MegaphoneItem\) => \{/);
  assert.match(offers, /onEnter=\{viewVenue\}/);
  assert.doesNotMatch(offers, /navigate\('ChatRoom'/);
  assert.doesNotMatch(offers, /enterBusiness/);
  assert.match(offers, /<BusinessCardSheet business=\{venueCard\?\.business \?\? null\} userCoords=\{venueCard\?\.coords \?\? null\}/);
  assert.match(read('components/map/BusinessCardSheet.tsx'), /<BusinessPreviewCard/);
});

test('one read of the business by id, with the same columns the Map reads; a failure shows the generic error; the button shows a spinner meanwhile', () => {
  assert.match(offers, /await fetchBusinessForCard\(item\.business_id\)/);
  assert.match(offers, /showAlert\(commonTranslation\.t\('state\.error'\)\)/);
  assert.match(offers, /setVenueCard\(\{ business, coords: coordsRef\.current \}\)/, 'inside_radius stays unknown without a position');
  const service = read('services/businesses.ts');
  assert.match(service, /\.eq\('id', businessId\)\.maybeSingle\(\)/);
  assert.match(service, /export const BUSINESS_CARD_COLUMNS =/);
  const map = read('screens/map/MapScreen.tsx');
  assert.match(map, /\.select\(BUSINESS_CARD_COLUMNS\)/);
  assert.match(map, /resolveMainRoomId.*from '\.\.\/\.\.\/services\/businesses'|from '\.\.\/\.\.\/services\/businesses'/);
  for (const card of [post, offer]) {
    assert.match(card, /opening\?: boolean;/);
    assert.match(card, /<Spinner size="small"/);
  }
});

test('inside the card, outside the radius "Entrar al chat" is disabled (inside_radius === false); the card computes it from the position', () => {
  const preview = read('components/map/BusinessPreviewCard.tsx');
  assert.match(preview, /const blocked = inside_radius === false;/);
  assert.match(preview, /disabled=\{blocked\}/);
  const sheet = read('components/map/BusinessCardSheet.tsx');
  assert.match(sheet, /inside_radius: typeof radius === 'number' && radius > 0 \? distance_m <= radius : null/);
  assert.match(sheet, /inside_radius=\{geo\.inside_radius\}/);
});

test('the button says "Ver local" / "View venue"', () => {
  assert.equal(JSON.parse(read('i18n/locales/es/offers.json')).enter, 'Ver local');
  assert.equal(JSON.parse(read('i18n/locales/en/offers.json')).enter, 'View venue');
});
