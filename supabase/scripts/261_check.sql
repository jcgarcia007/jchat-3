-- 261 — comprobación DESPUÉS de aplicar supabase/migrations/261_delete_account_remaining_fks.sql. NO ESCRIBE NADA: todo es select.

-- (a) Acción de borrado de las 8 columnas.   Esperado: las 8 = SET NULL y nullable = YES
select c.conrelid::regclass::text as tabla, a.attname as columna, a.attnotnull as not_null,
       case c.confdeltype when 'c' then 'CASCADE' when 'n' then 'SET NULL' when 'a' then 'NO ACTION' when 'r' then 'RESTRICT' when 'd' then 'SET DEFAULT' end as on_delete
from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
where c.contype = 'f' and c.confrelid in ('public.users'::regclass, 'auth.users'::regclass)
  and (c.conrelid::regclass::text, a.attname) in (
    ('affiliate_commissions','user_id'), ('affiliate_payouts','created_by'), ('affiliates','created_by'), ('stock_movements','created_by'),
    ('radius_increase_requests','requested_by'), ('radius_increase_requests','reviewed_by'), ('pos_payments','paid_by'), ('businesses','verified_by'))
order by 1, 2;

-- (b) El defecto en TODO el catálogo: claves a users / auth.users con NO ACTION o RESTRICT.   Esperado: 0 filas
select c.conrelid::regclass::text as tabla, a.attname as columna, c.conname, c.confrelid::regclass::text as referencia
from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
where c.contype = 'f' and c.confdeltype in ('a', 'r') and c.confrelid in ('auth.users'::regclass, 'public.users'::regclass)
order by 1, 2;

-- (c) Y el otro defecto de la 255: SET NULL sobre columna NOT NULL.   Esperado: 0 filas
select c.conrelid::regclass::text as tabla, a.attname as columna, c.conname
from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
where c.contype = 'f' and c.confdeltype = 'n' and a.attnotnull and c.confrelid in ('auth.users'::regclass, 'public.users'::regclass)
order by 1, 2;
