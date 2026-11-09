// M2: the staff notices (staff_added / staff_removed) are wired end to end in the app. Run from mobile/:  node --test scripts/staff-notifications.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const hook = read('../hooks/useNotifications.ts');
const presenter = read('../hooks/useNotificationPresenter.ts');
const service = read('../services/notifications.ts');
const navigator = read('../navigation/AppNavigator.tsx');
const social = (lang) => JSON.parse(read(`../i18n/locales/${lang}/social.json`)).messages.notif;

test('the type exists, is part of the social list and has its own icon and accent', () => {
  assert.match(service, /\| 'staff_added'/);
  assert.match(service, /\| 'staff_removed'/);
  assert.match(service, /STAFF_NOTIFICATION_TYPES: readonly NotificationType\[\] = \['staff_added', 'staff_removed'\]/);
  assert.match(service, /case 'staff_added':\s*\n\s*return \{ icon: IconUserCheck/);
  assert.match(service, /case 'staff_removed':\s*\n\s*return \{ icon: IconUserMinus/);
  assert.match(presenter, /staff_added: IconUserCheck/);
  assert.match(presenter, /staff_removed: IconUserMinus/);
});

test('with the app open both show the OS banner (they are events a person must not miss)', () => {
  const set = hook.slice(hook.indexOf('FOREGROUND_BANNER_TYPES'), hook.indexOf(']);', hook.indexOf('FOREGROUND_BANNER_TYPES')));
  assert.ok(set.includes("'staff_added'") && set.includes("'staff_removed'"));
});

test('a tap on staff_added opens the venue chat through the same helper as the other chat entries', () => {
  assert.match(navigator, /route\.screen === 'ChatRoom'\) openVenueChat\(route\.params\.id\)/);
});

test('the texts exist in es and en, with the venue (and the role when there is one)', () => {
  for (const lang of ['es', 'en']) {
    const n = social(lang);
    assert.match(n.staffAdded, /\{\{business\}\}/);
    assert.match(n.staffAdded, /\{\{role\}\}/);
    assert.match(n.staffAddedNoRole, /\{\{business\}\}/);
    assert.ok(!/\{\{role\}\}/.test(n.staffAddedNoRole));
    assert.match(n.staffRemoved, /\{\{business\}\}/);
  }
  assert.equal(social('es').staffRemoved, 'Ya no formas parte del personal de {{business}}');
  assert.equal(social('en').staffRemoved, "You're no longer on the staff of {{business}}");
});
