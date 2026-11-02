// Fails when the migrations leave a foreign key to public.users / auth.users with ON DELETE SET NULL on a NOT NULL column.
// Run from mobile/:  node --test scripts/migrations-users-fk-set-null.test.mjs
//
// Why (store test B2-1, P0): delete-account calls auth.admin.deleteUser(), which deletes auth.users and cascades into public.users.
// A FK that must "SET NULL" a NOT NULL column cannot do it, Postgres aborts the whole delete ("Database error deleting user"), and the
// person can never delete their account (Apple 5.1.1(v), Google Play). Migration 255 fixed the five that existed: messages.user_id,
// pinned_messages.pinned_by, disputes.opened_by (now CASCADE) and gifts.from_user / gifts.to_user (now nullable).
//
// How: reads supabase/migrations/*.sql in order (the baseline 245 restates the whole history), strips `--` comments and replays the
// statements that decide the answer: CREATE TABLE (column NOT NULL, inline and table-level FKs), ALTER TABLE ... ADD COLUMN /
// ADD CONSTRAINT ... FOREIGN KEY / DROP CONSTRAINT / ALTER COLUMN SET|DROP NOT NULL. LIMITS: it reads the migrations, not the live
// database (supabase/scripts/255_check.sql, query (c), asks the catalog the same question); it does not see DDL built with `execute`.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SUPABASE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase');
const MIGRATIONS = join(SUPABASE, 'migrations');

const files = () => readdirSync(MIGRATIONS).filter((f) => /^\d+_.*\.sql$/.test(f) && !/_destructive\.sql$/.test(f)).sort();
const readSql = (f) => readFileSync(join(MIGRATIONS, f), 'utf8').replace(/--[^\n]*/g, '');

const ID = '"?([A-Za-z_][\\w]*)"?';
const TABLE = `(?:"?(?:public|auth)"?\\.)?${ID}`;
const USERS_REF = /references\s+(?:"?(?:public|auth)"?\.)?"?users"?\s*\(\s*"?id"?\s*\)([^,;)]*)/i;
const onDelete = (tail) => {
  const m = /on\s+delete\s+(set\s+null|set\s+default|cascade|restrict|no\s+action)/i.exec(tail ?? '');
  return m ? m[1].toLowerCase().replace(/\s+/g, ' ') : 'no action';
};

/** Top-level comma split of a CREATE TABLE body. */
function splitTop(body) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/** Replays the migrations and returns "table.column" for every FK to users with SET NULL over a NOT NULL column. */
export function violations(sqlTexts) {
  const notNull = new Map(); // "tbl.col" -> boolean
  const fks = new Map(); // constraint name -> { key: "tbl.col", action }
  const inlineFks = new Map(); // "tbl.col" -> action (inline / unnamed)

  const events = [];
  for (const sql of sqlTexts) {
    const base = events.length ? events[events.length - 1].index + 1 : 0; // keeps files in order
    let offset = base;
    const push = (index, fn) => events.push({ index: offset + index, fn });

    for (const m of sql.matchAll(new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(?:only\\s+)?${TABLE}\\s*\\(`, 'gi'))) {
      const table = m[1];
      let depth = 1;
      let i = m.index + m[0].length;
      const start = i;
      while (i < sql.length && depth > 0) { if (sql[i] === '(') depth++; if (sql[i] === ')') depth--; i++; }
      const body = sql.slice(start, i - 1);
      push(m.index, () => {
        for (const raw of splitTop(body)) {
          const part = raw.trim();
          if (/^(constraint\s+\S+\s+)?foreign\s+key/i.test(part) || /^constraint\s+\S+\s+foreign\s+key/i.test(part)) {
            const fk = /foreign\s+key\s*\(\s*"?(\w+)"?\s*\)/i.exec(part);
            const ref = USERS_REF.exec(part);
            const name = /^constraint\s+"?(\w+)"?/i.exec(part)?.[1];
            if (fk && ref) {
              const key = `${table}.${fk[1]}`;
              if (name) fks.set(name, { key, action: onDelete(ref[1]) }); else inlineFks.set(key, onDelete(ref[1]));
            }
            continue;
          }
          if (/^(constraint|primary|unique|check|exclude|like)\b/i.test(part)) continue;
          const col = /^"?(\w+)"?\s/.exec(part)?.[1];
          if (!col) continue;
          const key = `${table}.${col}`;
          notNull.set(key, /\bnot\s+null\b/i.test(part) || /\bprimary\s+key\b/i.test(part));
          const ref = USERS_REF.exec(part);
          if (ref) inlineFks.set(key, onDelete(ref[1]));
        }
      });
    }

    const alterRe = new RegExp(`alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?${TABLE}\\s+([^;]*?)(?=;|\\s+end\\s+if|$)`, 'gi');
    for (const m of sql.matchAll(alterRe)) {
      const table = m[1];
      const tail = m[2];
      push(m.index, () => {
        let t;
        if ((t = /^alter\s+column\s+"?(\w+)"?\s+(set|drop)\s+not\s+null/i.exec(tail))) notNull.set(`${table}.${t[1]}`, t[2].toLowerCase() === 'set');
        if ((t = /^add\s+constraint\s+"?(\w+)"?\s+foreign\s+key\s*\(\s*"?(\w+)"?\s*\)\s*(.*)$/is.exec(tail))) {
          const ref = USERS_REF.exec(t[3]);
          if (ref) fks.set(t[1], { key: `${table}.${t[2]}`, action: onDelete(ref[1]) });
        }
        if ((t = /^drop\s+constraint\s+(?:if\s+exists\s+)?"?(\w+)"?/i.exec(tail))) fks.delete(t[1]);
        if ((t = /^add\s+column\s+(?:if\s+not\s+exists\s+)?"?(\w+)"?\s+(.*)$/is.exec(tail))) {
          const key = `${table}.${t[1]}`;
          notNull.set(key, /\bnot\s+null\b/i.test(t[2]));
          const ref = USERS_REF.exec(t[2]);
          if (ref) inlineFks.set(key, onDelete(ref[1]));
        }
      });
    }
    offset += sql.length + 1;
  }

  events.sort((a, b) => a.index - b.index);
  for (const e of events) e.fn();

  const bad = new Set();
  for (const { key, action } of fks.values()) if (action === 'set null' && notNull.get(key)) bad.add(key);
  for (const [key, action] of inlineFks) if (action === 'set null' && notNull.get(key)) bad.add(key);
  return [...bad].sort();
}

const KNOWN_BEFORE_255 = ['disputes.opened_by', 'gifts.from_user', 'gifts.to_user', 'messages.user_id', 'pinned_messages.pinned_by'];

test('the parser finds the five known bad foreign keys before migration 255 (it does not pass on an empty answer)', () => {
  const before = files().filter((f) => parseInt(f, 10) < 255).map(readSql);
  assert.deepEqual(violations(before), KNOWN_BEFORE_255);
});

test('no migration leaves a FK to users with ON DELETE SET NULL over a NOT NULL column', () => {
  assert.deepEqual(violations(files().map(readSql)), [], 'deleting such a user would abort with "Database error deleting user"');
});

test('255: chat messages, pins and disputes cascade with the account; gifts keep the row (nullable + SET NULL)', () => {
  const sql = readSql('255_account_delete_fks.sql');
  for (const [table, col, name] of [['messages', 'user_id', 'messages_user_id_fkey'], ['pinned_messages', 'pinned_by', 'pinned_messages_pinned_by_fkey'], ['disputes', 'opened_by', 'disputes_opened_by_fkey']]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} add constraint ${name} foreign key \\(${col}\\) references public\\.users\\(id\\) on delete cascade`), `${table}.${col} → CASCADE`);
    assert.match(sql, new RegExp(`conrelid = 'public\\.${table}'::regclass and confdeltype <> 'c'`), `${table}: only recreated when it is not CASCADE yet (idempotent)`);
  }
  assert.match(sql, /alter table public\.gifts alter column from_user drop not null;/);
  assert.match(sql, /alter table public\.gifts alter column to_user drop not null;/);
  assert.doesNotMatch(sql, /alter table public\.gifts[^;]*(drop constraint|set not null)/i, 'gifts keeps its ON DELETE SET NULL keys');
});

test('255 is non-destructive and idempotent in form (no delete/truncate/drop table/drop column, no "drop constraint if exists" + add)', () => {
  const sql = readSql('255_account_delete_fks.sql');
  assert.doesNotMatch(sql, /\b(delete\s+from|truncate|drop\s+table|drop\s+column|drop\s+constraint\s+if\s+exists)\b/i);
  // every drop constraint is inside a DO block guarded by a pg_constraint check
  const drops = sql.match(/drop constraint/gi) ?? [];
  const guards = sql.match(/from pg_constraint where conname/gi) ?? [];
  assert.ok(drops.length === 3 && guards.length >= 6, 'three guarded recreations (each checks pg_constraint twice)');
});

test('255_check.sql only reads, and asks the catalog the same question as this test (query c)', () => {
  const check = readFileSync(join(SUPABASE, 'scripts', '255_check.sql'), 'utf8').replace(/--[^\n]*/g, '');
  assert.doesNotMatch(check, /\b(insert|update|delete|alter|drop|create|truncate|grant|revoke)\b/i, 'select only');
  assert.match(check, /c\.confdeltype\s*=\s*'n'\s+and\s+a\.attnotnull/i);
  assert.match(check, /'auth\.users'::regclass,\s*'public\.users'::regclass/);
});

test('the rollback exists and refuses to re-add NOT NULL to gifts when deleted accounts left NULLs', () => {
  const rb = readFileSync(join(SUPABASE, 'rollbacks', '255_account_delete_fks_rollback.sql'), 'utf8');
  assert.match(rb, /on delete set null/i);
  assert.match(rb, /raise exception '255 rollback/);
});
