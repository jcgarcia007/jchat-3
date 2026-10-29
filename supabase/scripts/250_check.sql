-- 250 — comprobación DESPUÉS de aplicar supabase/migrations/250_story_reports.sql. NO ESCRIBE NADA: todo es select.

-- (a) Columnas nuevas.   Esperado: hidden_at y hidden_by
select column_name from information_schema.columns where table_schema = 'public' and table_name = 'stories' and column_name in ('hidden_at', 'hidden_by') order by 1;

-- (b) La política de stories.   Esperado: menciona hidden_at, is_blocked, is_private_account y follows
select regexp_replace(qual, '\s+', ' ', 'g') as using_ from pg_policies where schemaname = 'public' and tablename = 'stories' and policyname = 'stories_read';

-- (c) Las tres funciones conocen 'story'.   Esperado: 3 filas, todas true
select p.proname, pg_get_functiondef(p.oid) like '%''story''%' as conoce_story
from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('report_content', 'admin_hide_content', 'admin_report_content_exists') order by 1;
