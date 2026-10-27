-- 241 — comprobación DESPUÉS de aplicar supabase/migrations_archive/241_venue_table_labels.sql.
-- NO ESCRIBE NADA: solo select. No imprime ningún token ni código de mesa (la función solo devuelve etiquetas).
-- Ojo: en el SQL Editor no hay sesión (auth.uid() es nulo), así que la función devuelve vacío allí A PROPÓSITO; el resultado
-- con una persona dentro del local se comprueba desde la app (la hoja de aceptar un regalo, dentro de Bar XZX).

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- (a) Permisos.   Esperado: anon = false · authenticated = true
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
select
  has_function_privilege('anon',          'public.venue_table_labels(uuid)', 'execute') as anon,
  has_function_privilege('authenticated', 'public.venue_table_labels(uuid)', 'execute') as authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- (b) Forma de la función.
--     Esperado: resultado = 'TABLE(label text)' (solo la etiqueta) · security_definer = true · stable = true ·
--               la configuración fija search_path = public, pg_temp
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
select
  pg_get_function_result(p.oid)  as resultado,
  p.prosecdef                    as security_definer,
  (p.provolatile = 's')          as stable,
  p.proconfig                    as configuracion
from pg_proc p
where p.oid = 'public.venue_table_labels(uuid)'::regprocedure;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- (c) El orden para Bar XZX (la MISMA ordenación de la función, sin el filtro de presencia que aquí no se puede cumplir).
--     Esperado: T1, T2, T3, T4, T5, T6, T7, T8, T9, T10 (en ese orden: T10 al final, no después de T1)
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
select t.label
from public.tables t
join public.businesses b on b.id = t.business_id
where b.slug = 'bar-xzx-omd2' and t.is_active
order by (substring(t.label from '\d{1,9}'))::int asc nulls last, lower(t.label), t.label;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- (d) Sin sesión devuelve vacío y sin error (así llega desde el SQL Editor).   Esperado: etiquetas = 0
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
select count(*) as etiquetas
from public.businesses b, public.venue_table_labels(b.id)
where b.slug = 'bar-xzx-omd2';
