// The image viewer pages between the photos of a post (a JS strip, one-finger horizontal drag at 1x, dots, zoom back to 1x on each page) and still behaves
// like the single-photo viewer for the DMs and the chat. Pure part: utils/imagePager.ts. Run from mobile/:  node --test scripts/image-viewer.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const js = ts.transpileModule(read('utils/imagePager.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', js)(mod, mod.exports);
const { panIntent, clampPage, dragOffset, pageAfterRelease, viewerImages, PAGE_SWIPE_RATIO, PAGE_SWIPE_VELOCITY } = mod.exports;

test('a one-finger drag at 1x: horizontal pages (only with more than one photo), anything else drags down to close', () => {
  assert.equal(panIntent(40, 5, 3), 'page');
  assert.equal(panIntent(-40, 5, 2), 'page');
  assert.equal(panIntent(40, 5, 1), 'dismiss', 'a single photo has nothing to page to: exactly the old viewer');
  assert.equal(panIntent(5, 40, 3), 'dismiss');
  assert.equal(panIntent(10, 10, 3), 'dismiss', 'a tie is not a page');
});

test('pages are clamped to the photos that exist', () => {
  assert.equal(clampPage(-2, 3), 0);
  assert.equal(clampPage(1, 3), 1);
  assert.equal(clampPage(9, 3), 2);
  assert.equal(clampPage(5, 0), 0);
});

test('the strip follows the finger, with resistance past the first and the last photo', () => {
  assert.equal(dragOffset(80, 1, 3), 80);
  assert.equal(dragOffset(-80, 1, 3), -80);
  assert.equal(dragOffset(100, 0, 3), 30, 'pulling right on the first photo');
  assert.equal(dragOffset(-100, 2, 3), -30, 'pulling left on the last photo');
  assert.equal(dragOffset(-100, 0, 3), -100, 'towards the next photo from the first one is free');
});

test('on release: past 20 % of the width or a fast flick changes page, otherwise it comes back; never beyond the ends', () => {
  const W = 400;
  assert.equal(PAGE_SWIPE_RATIO, 0.2);
  assert.equal(PAGE_SWIPE_VELOCITY, 500);
  assert.equal(pageAfterRelease(1, -79, 0, W, 3), 1, 'just under 20 %');
  assert.equal(pageAfterRelease(1, -81, 0, W, 3), 2, 'just over 20 %, to the left → next');
  assert.equal(pageAfterRelease(1, 81, 0, W, 3), 0, 'to the right → previous');
  assert.equal(pageAfterRelease(1, -20, -800, W, 3), 2, 'a short but fast flick left');
  assert.equal(pageAfterRelease(1, 20, 800, W, 3), 0, 'a short but fast flick right');
  assert.equal(pageAfterRelease(0, 300, 0, W, 3), 0, 'no page before the first');
  assert.equal(pageAfterRelease(2, -300, -900, W, 3), 2, 'no page after the last');
});

test('the viewer holds `uris`, or the single `uri` the DMs and the chat pass; nothing → empty', () => {
  assert.deepEqual(viewerImages(['a', 'b'], 'c'), ['a', 'b'], '`uris` wins');
  assert.deepEqual(viewerImages(undefined, 'c'), ['c']);
  assert.deepEqual(viewerImages([], 'c'), ['c']);
  assert.deepEqual(viewerImages(undefined, null), []);
  assert.deepEqual(viewerImages(null, undefined), []);
});

// ── Static checks on the viewer ────────────────────────────────────────────────

const viewer = read('components/ImageViewerModal.tsx');

test('paging happens only at 1x: while a photo is zoomed the drag moves the photo; changing page resets the zoom to 1x', () => {
  assert.match(viewer, /panMode\.value = scale\.value > ZOOMED_EPSILON \? MODE_ZOOMED : MODE_UNDECIDED;/);
  assert.match(viewer, /panMode\.value = panIntent\(e\.translationX, e\.translationY, count\) === 'page' \? MODE_PAGE : MODE_DISMISS;/);
  assert.match(viewer, /if \(Math\.abs\(e\.translationX\) < INTENT_DISTANCE && Math\.abs\(e\.translationY\) < INTENT_DISTANCE\) return;/, 'the direction is judged on the first real movement');
  const effect = viewer.slice(viewer.indexOf('// The strip sits on the current page'), viewer.indexOf('const onCloseRef'));
  assert.match(effect, /scale\.value = 1;/);
  assert.match(effect, /\[index, box\.w,/, 'it runs whenever the page changes');
  assert.match(viewer, /pageAfterRelease\(current, e\.translationX, e\.velocityX, boxW\.value, count\)/);
});

test('the tap rule is kept: outside the photo closes at 1x, on the photo does nothing (the photo rectangle is the CURRENT page\'s)', () => {
  assert.match(viewer, /if \(!success \|\| scale\.value > ZOOMED_EPSILON\) return;/);
  assert.match(viewer, /Math\.abs\(e\.x - boxW\.value \/ 2\) <= imgW\.value \/ 2 && Math\.abs\(e\.y - boxH\.value \/ 2\) <= imgH\.value \/ 2/);
  assert.match(viewer, /if \(!inside\) scheduleOnRN\(closeFromGesture\)/);
  assert.match(viewer, /imgW\.value = active\.w;/, 'the rectangle comes from the current page');
  assert.match(viewer, /Gesture\.Exclusive\(doubleTap, singleTap\)/, 'the double tap still wins over the single tap');
});

test('dots only with more than one photo; `uri` stays as an alias; `uris` + `initialIndex` + `fallbackUris` exist', () => {
  assert.match(viewer, /\{count > 1 \? \(\s*<View\s+testID="image-viewer-dots"/);
  assert.match(viewer, /uri\?: string \| null;/);
  assert.match(viewer, /uris\?: readonly string\[\];/);
  assert.match(viewer, /initialIndex\?: number;/);
  assert.match(viewer, /fallbackUris\?: readonly \(string \| null \| undefined\)\[\];/);
  assert.equal(JSON.parse(read('i18n/locales/en/common.json')).imageViewer.page, 'Photo {{current}} of {{total}}');
  assert.equal(JSON.parse(read('i18n/locales/es/common.json')).imageViewer.page, 'Foto {{current}} de {{total}}');
});

test('nothing native is added: the viewer imports only what it already imported (gesture handler, reanimated, worklets) and the pure pager', () => {
  const imports = [...viewer.matchAll(/^import[^;]*?from\s+'([^']+)'/gms)].map((m) => m[1]);
  const allowed = new Set([
    'react', 'react-native', './common/Spinner', './common/AppModal', 'expo-image', 'react-native-gesture-handler', 'react-native-reanimated',
    'react-native-worklets', 'react-native-safe-area-context', 'react-i18next', `@tabler/${'icons-react-native'}`, '../theme/tokens', '../utils/imagePager',
  ]);
  for (const spec of imports) assert.ok(allowed.has(spec), `unexpected import: ${spec}`);
  assert.doesNotMatch(read('utils/imagePager.ts'), /^import /m);
});

// ── Wiring ─────────────────────────────────────────────────────────────────────

test('the DMs and the venue chat keep passing a single `uri` (unchanged)', () => {
  assert.match(read('screens/dms/DMChatScreen.tsx'), /<ImageViewerModal\s+visible=\{viewerUri != null\}\s+uri=\{viewerUri\}/);
  assert.match(read('screens/chat/ChatRoomScreen.tsx'), /<ImageViewerModal visible=\{viewerImage != null\} uri=\{viewerImage\}/);
});

test('a tap on a photo opens the viewer on THAT photo, in the post detail, the feed card and the offers feed', () => {
  const detail = read('screens/posts/PostDetailScreen.tsx');
  assert.match(detail, /testID=\{`post-photo-\$\{index\}`\} onPress=\{\(\) => setViewerIndex\(index\)\} accessibilityRole="imagebutton"/);
  assert.match(detail, /<ImageViewerModal visible uris=\{post\.media_urls\} initialIndex=\{viewerIndex\}/);
  const feed = read('components/feed/PostCard.tsx');
  assert.match(feed, /testID=\{`feed-photo-\$\{idx\}`\}/);
  assert.match(feed, /onPress=\{\(\) => setViewerIndex\(idx\)\}/);
  assert.match(feed, /<ImageViewerModal visible uris=\{post\.media_urls\} initialIndex=\{viewerIndex\}/);
  const offers = read('components/megaphone/MegaphonePostCard.tsx');
  assert.match(offers, /testID=\{`offers-photo-\$\{index\}`\}/);
  assert.match(offers, /onPress=\{\(\) => setViewerIndex\(index\)\}/);
  assert.match(offers, /<ImageViewerModal visible uris=\{item\.media_urls\} initialIndex=\{viewerIndex\}/);
  for (const source of [detail, feed, offers]) assert.match(source, /accessibilityRole="imagebutton"/);
});

test('the profile grid cell still opens the post detail (no change)', () => {
  const screen = read('screens/profile/ProfileScreen.tsx');
  assert.match(screen, /onPress=\{\(\) => navigation\.navigate\('PostDetail', \{ postId: post\.id \}\)\}/);
  assert.doesNotMatch(screen, /uris=\{post/);
});
