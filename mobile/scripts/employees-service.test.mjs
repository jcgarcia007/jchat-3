// The app adds staff already 'accepted', like the web dashboard (no invitation to accept). Run from mobile/:  node --test scripts/employees-service.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const service = read('../services/employees.ts');
const sheet = read('../components/chat/AddEmployeeSheet.tsx');
const text = (lang) => JSON.parse(read(`../i18n/locales/${lang}/chat.json`)).employee;

test('addEmployee inserts status accepted (and never pending)', () => {
  const body = service.slice(service.indexOf('export async function addEmployee('), service.indexOf('// ─── listEmployees'));
  assert.match(body, /\.insert\(\{[\s\S]*status: 'accepted',[\s\S]*\}\)/);
  assert.ok(!/status: 'pending'/.test(body));
});

test('there is no accept / decline code left', () => {
  assert.ok(!/acceptInvite|declineInvite/.test(service));
});

test('no screen texts talk about a pending invitation (es and en), and the sheet does not promise one', () => {
  for (const lang of ['es', 'en']) {
    const e = text(lang);
    assert.ok(!/pend|accept|decline|acept|rechaz|pendiente/i.test(e.successNote), `${lang} successNote`);
    assert.ok(!/invit/i.test(`${e.inviteSentTitle} ${e.sendInviteA11y} ${e.inviteAs}`), `${lang} labels`);
  }
  assert.ok(!/pending record|Send Invite/.test(sheet));
});
