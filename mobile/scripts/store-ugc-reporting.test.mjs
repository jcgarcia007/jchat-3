// Apple 1.2 / Google UGC: stories and Truth or Dare results must be reportable (and their author blockable) from a visible control,
// with the same report sheet as the chat. Static check of the sources + the 250 draft migration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const json = (p) => JSON.parse(read(p));

test("'story' is a report content type on the app and on the web mirror", () => {
  assert.match(read('mobile/utils/reportReasons.ts'), /'dm_message' \| 'story'/);
  assert.match(read('web/lib/reportReasons.ts'), /'dm_message' \| 'story'/);
});

test('the story viewer shows Report and Block for other people\'s stories, with the chat report sheet', () => {
  const src = read('mobile/screens/stories/StoryViewerScreen.tsx');
  assert.match(src, /import \{ ReportReasonSheet \} from '\.\.\/\.\.\/components\/report\/ReportReasonSheet'/);
  assert.match(src, /contentType="story"/);
  assert.match(src, /!isOwnStory \?[\s\S]*testID="story-report"[\s\S]*testID="story-block"/);
  assert.match(src, /blockUser\(currentGroup\.userId\)/);
});

test('the Truth or Dare result has a visible Report that opens the chat message sheet (report / block)', () => {
  assert.match(read('mobile/components/games/TodDrawResult.tsx'), /!isOwn && onReport/);
  assert.match(read('mobile/components/chat/MessageBubble.tsx'), /onReportMessage=\{isOwn \? undefined : onLongPressMessage\}/);
});

test('texts exist in en and es', () => {
  for (const lang of ['en', 'es']) {
    const sv = json(`mobile/i18n/locales/${lang}/feed.json`).storyViewer;
    for (const k of ['reportA11y', 'blockA11y', 'blockTitle', 'blockMessage', 'block', 'cancel', 'blockErrorTitle', 'blockError']) {
      assert.ok(typeof sv[k] === 'string' && sv[k].length > 0, `${lang} storyViewer.${k}`);
    }
    const r = json(`mobile/i18n/locales/${lang}/tod.json`).result;
    assert.ok(r.report && r.reportA11y, `${lang} tod result.report`);
  }
});

test('draft migration 250 reports and hides stories, keeps 248\'s story visibility and is not destructive', () => {
  const sql = read('supabase/migrations/250_story_reports.sql');
  assert.match(sql, /add column if not exists hidden_at/);
  assert.match(sql, /'dm_message','story'/);
  assert.match(sql, /update public\.stories set hidden_at/);
  assert.match(sql, /alter policy stories_read on public\.stories using \([\s\S]*hidden_at is null[\s\S]*is_blocked[\s\S]*is_private_account[\s\S]*public\.follows/);
  assert.doesNotMatch(sql, /^\s*(drop|truncate|delete)\b/im);
});
