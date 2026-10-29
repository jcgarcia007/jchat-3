-- 250 — REVERSIÓN: deja la política de stories como la 248 (sin hidden_at) y quita la rama 'story' de las tres funciones.
-- La columna hidden_at se deja (no se borra nada); queda sin uso. La aplica Juan Carlos solo si hay que deshacer la 250.
alter policy stories_read on public.stories using (
  user_id = (select auth.uid())
  or (
    not public.is_blocked((select auth.uid()), user_id)
    and (
      not public.is_private_account(user_id)
      or exists (select 1 from public.follows f where f.follower_id = (select auth.uid()) and f.following_id = stories.user_id)
    )
  )
);

-- Las tres funciones: volver a ejecutar su definición del baseline (supabase/migrations/245_baseline.sql: report_content, admin_hide_content,
-- admin_report_content_exists) con `create or replace`.
