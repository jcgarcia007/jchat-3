-- 255 — comprobación DESPUÉS de aplicar supabase/migrations/255_account_delete_fks.sql. NO ESCRIBE NADA: todo es select.

-- (a) Acción de borrado de las 5 claves.   Esperado: messages/pinned_messages/disputes = CASCADE; gifts (2 filas) = SET NULL
select c.conrelid::regclass::text as tabla, a.attname as columna, c.conname,
       case c.confdeltype when 'c' then 'CASCADE' when 'n' then 'SET NULL' when 'a' then 'NO ACTION' when 'r' then 'RESTRICT' when 'd' then 'SET DEFAULT' end as on_delete
from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
where c.contype = 'f' and c.confrelid = 'public.users'::regclass
  and ((c.conrelid = 'public.messages'::regclass and a.attname = 'user_id')
    or (c.conrelid = 'public.pinned_messages'::regclass and a.attname = 'pinned_by')
    or (c.conrelid = 'public.disputes'::regclass and a.attname = 'opened_by')
    or (c.conrelid = 'public.gifts'::regclass and a.attname in ('from_user', 'to_user')))
order by 1, 2;

-- (b) Nulabilidad de esas columnas.   Esperado: messages.user_id, pinned_messages.pinned_by, disputes.opened_by = NO; gifts.from_user y gifts.to_user = YES
select table_name, column_name, is_nullable
from information_schema.columns
where table_schema = 'public' and ((table_name = 'messages' and column_name = 'user_id') or (table_name = 'pinned_messages' and column_name = 'pinned_by')
   or (table_name = 'disputes' and column_name = 'opened_by') or (table_name = 'gifts' and column_name in ('from_user', 'to_user')))
order by 1, 2;

-- (c) El defecto, en TODO el catálogo: claves a users / auth.users con ON DELETE SET NULL sobre una columna NOT NULL.   Esperado: 0 filas
select c.conrelid::regclass::text as tabla, a.attname as columna, c.conname, c.confrelid::regclass::text as referencia
from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
where c.contype = 'f' and c.confdeltype = 'n' and a.attnotnull and c.confrelid in ('auth.users'::regclass, 'public.users'::regclass)
order by 1, 2;

-- (d) INFORMATIVO (no lo cambia la 255): claves a users / auth.users con NO ACTION o RESTRICT. Si la cuenta que se borra tiene filas en estas
--     tablas, el borrado sigue fallando. Esperado hoy: affiliate_commissions.user_id, affiliate_payouts.created_by, affiliates.created_by,
--     businesses.verified_by, pos_payments.paid_by, stock_movements.created_by (y radius_increase_requests.*, que la función ya limpia antes).
select c.conrelid::regclass::text as tabla, a.attname as columna, c.conname, c.confrelid::regclass::text as referencia,
       case c.confdeltype when 'a' then 'NO ACTION' else 'RESTRICT' end as on_delete
from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
where c.contype = 'f' and c.confdeltype in ('a', 'r') and c.confrelid in ('auth.users'::regclass, 'public.users'::regclass)
order by 1, 2;

-- (e) Los comentarios de columna de gifts quedaron.   Esperado: 2 filas
select a.attname as columna, col_description(a.attrelid, a.attnum) is not null as con_comentario
from pg_attribute a where a.attrelid = 'public.gifts'::regclass and a.attname in ('from_user', 'to_user') order by 1;
