-- 268: users.plan_interval (cada cuánto se cobra el plan) y users.trial_used_at (ya usó su prueba gratis).
--
-- plan_interval: 'month' | '6month' | 'year' (null = sin suscripción de pago o intervalo desconocido). Lo escribe SOLO el webhook de la Edge Function
--   `subscriptions`, a partir de subscription.items[0].price.recurring (month/1, month/6, year/1). billing/page.tsx lo muestra.
-- trial_used_at: se escribe UNA vez (el webhook, `where trial_used_at is null`) cuando el alta tiene prueba, y no se borra nunca. Es el criterio de
--   "ya usó la prueba" de create_checkout; reemplaza a plan_trial_end != null, que el webhook pone a null al acabar la prueba y dejaba
--   dar otra prueba gratis cancelando y volviendo a suscribirse.
--
-- Backfill: quien ya tuvo prueba (plan_trial_end no nulo) queda con trial_used_at = plan_trial_end y no recibe otra. Para el usuario que hoy está
--   'trialing' ese valor es la fecha futura de fin de prueba; para el criterio solo importa que no sea null.
--
-- Permisos: NINGUNA de las dos columnas entra en el grant update(...) de `authenticated` (el UPDATE de users es una lista de columnas, mig. 066 /
--   baseline); las escribe el webhook con service_role. SELECT: authenticated y anon tienen SELECT de tabla, pero la RLS ("users: select own" /
--   "users: select platform admin") solo deja ver la fila propia, así que billing/page.tsx y la página de planes leen sus propios valores sin
--   ningún grant nuevo.
--
-- Orden de despliegue: aplicar ESTA migración ANTES de desplegar la Edge Function de la fase B (la función lee trial_used_at en create_checkout y
--   escribe plan_interval en el webhook; sin las columnas, create_checkout falla con "DB error").
--
-- Rollback (las columnas pueden quedarse sin uso; solo si hiciera falta):
--   alter table public.users drop constraint if exists users_plan_interval_check;
--   alter table public.users drop column if exists plan_interval;
--   alter table public.users drop column if exists trial_used_at;
--
-- Verificación:
--   select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name in ('plan_interval', 'trial_used_at');
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'users_plan_interval_check';
--   select count(*) filter (where trial_used_at is not null) as con_prueba, count(*) filter (where plan_trial_end is not null) as con_trial_end from public.users;  -- iguales tras el backfill

alter table public.users add column if not exists plan_interval text;
alter table public.users add column if not exists trial_used_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.users'::regclass and conname = 'users_plan_interval_check'
  ) then
    alter table public.users
      add constraint users_plan_interval_check
      check (plan_interval is null or plan_interval in ('month', '6month', 'year'));
  end if;
end $$;

-- Backfill (idempotente: no pisa un trial_used_at ya escrito).
update public.users
   set trial_used_at = coalesce(trial_used_at, plan_trial_end)
 where plan_trial_end is not null
   and trial_used_at is null;
