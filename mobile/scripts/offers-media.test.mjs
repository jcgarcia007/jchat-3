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
