// The owner of a venue enters the POS without being an employee (migration 260): pos_my_businesses then returns employee_id NULL.
// The types that carry it must say so. Run from mobile/:  node --test scripts/pos-owner-access.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('PosMyBusinessesRow.employee_id may be null (the owner without an employee row)', () => {
  assert.match(read('services/pos.ts'), /employee_id: string \| null;/);
});

test('the navigation params that carry employeeId accept null', () => {
  assert.match(read('navigation/SettingsStack.tsx'), /PosRoot: \{[^}]*employeeId: string \| null/);
  assert.match(read('navigation/PosNavigator.tsx'), /PosHome: \{[^}]*employeeId: string \| null/);
});

test('WorkModeScreen passes b.employee_id through as it is (no ! and no "as string")', () => {
  const source = read('screens/settings/WorkModeScreen.tsx');
  assert.match(source, /employeeId: b\.employee_id,/);
  assert.doesNotMatch(source, /b\.employee_id!|b\.employee_id as string/);
});
