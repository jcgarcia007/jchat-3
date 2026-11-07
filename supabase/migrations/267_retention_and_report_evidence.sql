-- JChat 3.0 — D6 (2026-11-07): retención con borrado automático, evidencia de reportes y bloqueo de reincidentes.
-- Idempotente. NO la aplica Claude Code: la aplica Juan Carlos / el asistente por MCP (nunca `supabase db push`). Antes de aplicarla se crea la clave
-- del vault (con OK de Juan; nadie la ve):  select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'ban_email_hmac_key', 'D6 HMAC key for banned e-mail fingerprints');
-- Sin esa clave la 267 se aplica igual: el alta de usuarios NO se bloquea (aviso en el log) y el borrado de cuenta no falla.
--
-- Qué hace:
--   A. La evidencia de un reporte sobrevive al borrado de la cuenta: reports.reporter_id y reports.reported_user_id pasan de ON DELETE CASCADE a
--      ON DELETE SET NULL (mismos nombres de constraint; el DO solo toca una FK que aún sea CASCADE o que falte). El snapshot y el resto del reporte
--      quedan; el mensaje/foto reportados siguen protegidos por message_under_retention_hold. La cuenta se borra igual, sin frenos.
--   B. message_under_retention_hold cuenta el año del hold NCMEC desde la RESOLUCIÓN (coalesce(resolved_at, created_at)); lo demás, igual.
--   C. retention_purge() returns jsonb: borra por lotes (máx. 5000 filas por tabla y pasada) según los plazos de la política, en este orden:
--        outbound_emails (enviados 30 d; fallidos/omitidos 90 d) · photo_moderation_log (90 d desde la última fecha que tenga; sin fechas, no se toca)
--        · review_bypass_log (90 d) · security_logs (90 d; 365 d las acciones report_%, user_suspended, user_unsuspended, retention_purge, email_unbanned)
--        · moderation_logs y tod_moderation_log (1 año) · table_reservation_log (1 año)
--        · reports (cerrados: 1 año desde resolved_at; seguridad infantil o escalados a NCMEC: 2 años desde resolved_at; los pendientes NUNCA)
--        · banned_emails (expires_at vencido).
--      Devuelve {tabla: n}; escribe UNA fila security_logs 'retention_purge' solo si borró algo. Solo service_role. Cron 'retention-purge' diario 04:45.
--      Pedidos, pagos y recibos NO se tocan (7 años sin datos personales, como hoy).
--   D. Huella del correo de las cuentas suspendidas que se borran, para impedir el re-registro (2 años como máximo, apelación por soporte@):
--        · email_fingerprint(text): HMAC-SHA256 (clave del vault 'ban_email_hmac_key') del correo normalizado (minúsculas; sin "+etiqueta"; en gmail.com y
--          googlemail.com sin puntos y googlemail = gmail). Sin clave: raise 'ban_key_missing'. Solo service_role.
--        · banned_emails (RLS sin políticas, solo service_role).
--        · BEFORE DELETE en auth.users: si la cuenta estaba suspendida (banned_until vigente) guarda la huella hasta least(banned_until, now() + 2 años).
--          NUNCA hace fallar el borrado.
--        · BEFORE INSERT en auth.users: huella vigente → raise 'signup_blocked' (P0001; el cliente ve "Database error saving new user"). Sin clave: no bloquea.
--        · admin_unban_email(text): solo administradores de la plataforma; borra la huella y escribe security_logs 'email_unbanned' (solo 8 caracteres de la huella).
--      Límite conocido: Apple "Hide My Email" crea un relay distinto por app; un reincidente con un relay nuevo no se detecta.
--
-- Rollback (manual, solo si se abandona; en el SQL Editor. Lo destructivo va en un NNN_destructive.sql aparte):
--   -- select cron.unschedule('retention-purge');                                                       (destructivo)
--   -- drop trigger if exists trg_auth_user_ban_check on auth.users; drop trigger if exists trg_auth_user_ban_fingerprint on auth.users;   (destructivo)
--   -- drop function if exists public.admin_unban_email(text); drop function if exists public.auth_user_ban_check(); drop function if exists public.auth_user_ban_fingerprint();
--   -- drop function if exists public.email_fingerprint(text); drop function if exists public.retention_purge(); drop table if exists public.banned_emails;
--   -- message_under_retention_hold(): volver al cuerpo de 245_baseline.sql (líneas 3565-3583: r.created_at en vez de coalesce(r.resolved_at, r.created_at)).
--   -- FKs de reports: volver a ON DELETE CASCADE solo si se acepta que la evidencia desaparezca con la cuenta.

-- ───────── A. La evidencia sobrevive al borrado de la cuenta ─────────
alter table public.reports alter column reporter_id drop not null;
alter table public.reports alter column reported_user_id drop not null;

do $$
declare
  r record;
begin
  for r in select * from (values ('reports_reporter_id_fkey', 'reporter_id'), ('reports_reported_user_id_fkey', 'reported_user_id')) as t(conname, colname) loop
    -- an FK that still cascades is replaced (same name); a missing one is created; one that already sets null is left alone
    if exists (select 1 from pg_constraint where conrelid = 'public.reports'::regclass and conname = r.conname and contype = 'f' and confdeltype <> 'n') then
      execute format('alter table public.reports drop constraint %I', r.conname);
    end if;
    if not exists (select 1 from pg_constraint where conrelid = 'public.reports'::regclass and conname = r.conname) then
      execute format('alter table public.reports add constraint %I foreign key (%I) references public.users (id) on delete set null', r.conname, r.colname);
    end if;
  end loop;
end $$;

-- ───────── B. El hold NCMEC cuenta desde la resolución ─────────
create or replace function public.message_under_retention_hold(p_message_id uuid) returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1
    from public.reports r
    where r.content_type = 'message'
      and r.content_id = p_message_id
      and (
        r.status = 'pending'
        or (
          (lower(split_part(coalesce(r.reason, ''), ':', 1)) in ('child_safety', 'minor', 'sexual_content')
            or r.resolution = 'escalated_ncmec')
          and coalesce(r.resolved_at, r.created_at) > now() - interval '365 days'
        )
      )
  );
$$;

-- ───────── D (tabla). Huellas de correos bloqueados ─────────
create table if not exists public.banned_emails (
  fingerprint      text primary key,
  reason           text,
  source_report_id uuid,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null
);
create index if not exists banned_emails_expires_idx on public.banned_emails (expires_at);
alter table public.banned_emails enable row level security;
revoke all on public.banned_emails from anon, authenticated;
grant select, insert, update, delete on public.banned_emails to service_role;

-- ───────── C. Borrado automático por plazos ─────────
create or replace function public.retention_purge() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v jsonb := '{}'::jsonb;
  n integer;
begin
  -- cola de correos: enviados 30 días; fallidos u omitidos 90 días (pending nunca)
  with d as (
    delete from public.outbound_emails where id in (
      select id from public.outbound_emails
       where (status = 'sent' and sent_at < now() - interval '30 days')
          or (status in ('failed', 'skipped') and created_at < now() - interval '90 days')
       limit 5000) returning 1
  ) select count(*) into n from d;
  if n > 0 then v := v || jsonb_build_object('outbound_emails', n); end if;

  -- moderación de fotos: 90 días desde la última fecha que tenga la fila (sin ninguna fecha, no se toca)
  with d as (
    delete from public.photo_moderation_log where (kind, ref_id) in (
      select kind, ref_id from public.photo_moderation_log
       where greatest(last_attempt_at, alerted_at, notified_at) < now() - interval '90 days'
       limit 5000) returning 1
  ) select count(*) into n from d;
  if n > 0 then v := v || jsonb_build_object('photo_moderation_log', n); end if;

  with d as (
    delete from public.review_bypass_log where id in (
      select id from public.review_bypass_log where at < now() - interval '90 days' limit 5000) returning 1
  ) select count(*) into n from d;
  if n > 0 then v := v || jsonb_build_object('review_bypass_log', n); end if;

  -- registros de seguridad: 90 días; 365 días el historial de moderación y del propio borrado
  with d as (
    delete from public.security_logs where id in (
      select id from public.security_logs
       where created_at < now() - case
         when action like 'report\_%' or action in ('user_suspended', 'user_unsuspended', 'retention_purge', 'email_unbanned') then interval '365 days'
         else interval '90 days' end
       limit 5000) returning 1
  ) select count(*) into n from d;
  if n > 0 then v := v || jsonb_build_object('security_logs', n); end if;

  with d as (
    delete from public.moderation_logs where id in (
      select id from public.moderation_logs where created_at < now() - interval '365 days' limit 5000) returning 1
  ) select count(*) into n from d;
  if n > 0 then v := v || jsonb_build_object('moderation_logs', n); end if;

  with d as (
    delete from public.tod_moderation_log where id in (
      select id from public.tod_moderation_log where created_at < now() - interval '365 days' limit 5000) returning 1
  ) select count(*) into n from d;
  if n > 0 then v := v || jsonb_build_object('tod_moderation_log', n); end if;

  with d as (
    delete from public.table_reservation_log where id in (
      select id from public.table_reservation_log where created_at < now() - interval '365 days' limit 5000) returning 1
  ) select count(*) into n from d;
  if n > 0 then v := v || jsonb_build_object('table_reservation_log', n); end if;

  -- reportes cerrados: 1 año desde la resolución; seguridad infantil o escalados a NCMEC: 2 años; los pendientes no se borran nunca
  with d as (
    delete from public.reports where id in (
      select id from public.reports
       where status in ('dismissed', 'resolved')
         and resolved_at is not null
         and resolved_at < now() - case
           when lower(split_part(coalesce(reason, ''), ':', 1)) in ('child_safety', 'minor', 'sexual_content') or resolution = 'escalated_ncmec'
             then interval '730 days'
           else interval '365 days' end
       limit 5000) returning 1
  ) select count(*) into n from d;
  if n > 0 then v := v || jsonb_build_object('reports', n); end if;

  with d as (
    delete from public.banned_emails where fingerprint in (
      select fingerprint from public.banned_emails where expires_at < now() limit 5000) returning 1
  ) select count(*) into n from d;
  if n > 0 then v := v || jsonb_build_object('banned_emails', n); end if;

  if v <> '{}'::jsonb then
    insert into public.security_logs (actor_id, action, target_type, target_id, detail)
    values (null, 'retention_purge', 'retention', null, v::text);
  end if;
  return v;
end;
$$;

revoke all on function public.retention_purge() from public, anon, authenticated;
grant execute on function public.retention_purge() to service_role;

-- ───────── D. Huella del correo ─────────
create or replace function public.email_fingerprint(p_email text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_key   text;
  v_mail  text := lower(trim(coalesce(p_email, '')));
  v_local text;
  v_dom   text;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'ban_email_hmac_key' limit 1;
  if v_key is null then raise exception 'ban_key_missing'; end if;
  v_local := regexp_replace(v_mail, '@[^@]*$', '');
  v_dom := coalesce(substring(v_mail from '@([^@]*)$'), '');
  v_local := split_part(v_local, '+', 1);
  if v_dom in ('gmail.com', 'googlemail.com') then
    v_local := replace(v_local, '.', '');
    v_dom := 'gmail.com';
  end if;
  return encode(extensions.hmac(v_local || '@' || v_dom, v_key, 'sha256'), 'hex');
end;
$$;

revoke all on function public.email_fingerprint(text) from public, anon, authenticated;
grant execute on function public.email_fingerprint(text) to service_role;

-- Al borrar una cuenta suspendida, su huella queda (hasta 2 años o hasta que venza la suspensión). No puede hacer fallar el borrado.
create or replace function public.auth_user_ban_fingerprint() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  begin
    if old.banned_until is not null and old.banned_until > now() and old.email is not null then
      insert into public.banned_emails (fingerprint, reason, source_report_id, expires_at)
      values (public.email_fingerprint(old.email),
              coalesce((select u.suspended_reason from public.users u where u.id = old.id), 'suspended'),
              null,
              least(old.banned_until, now() + interval '2 years'))
      on conflict (fingerprint) do update
        set expires_at = greatest(public.banned_emails.expires_at, excluded.expires_at);
    end if;
  exception when others then
    raise warning 'auth_user_ban_fingerprint: not stored (%)', sqlerrm;
  end;
  return old;
end;
$$;

create or replace trigger trg_auth_user_ban_fingerprint
  before delete on auth.users
  for each row execute function public.auth_user_ban_fingerprint();

-- Alta con una huella vigente → 'signup_blocked'. Sin clave en el vault, o cualquier fallo al calcular la huella, NO bloquea el registro.
create or replace function public.auth_user_ban_check() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_fp text;
begin
  if new.email is null then return new; end if;
  begin
    v_fp := public.email_fingerprint(new.email);
  exception when others then
    raise warning 'auth_user_ban_check: not checked (%)', sqlerrm;
    return new;
  end;
  if exists (select 1 from public.banned_emails b where b.fingerprint = v_fp and b.expires_at > now()) then
    raise exception 'signup_blocked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace trigger trg_auth_user_ban_check
  before insert on auth.users
  for each row execute function public.auth_user_ban_check();

-- Quitar el bloqueo de un correo (apelación). Solo administradores de la plataforma. El log guarda 8 caracteres de la huella, nunca el correo.
create or replace function public.admin_unban_email(p_email text) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_fp   text;
  v_rows integer;
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  v_fp := public.email_fingerprint(p_email);
  delete from public.banned_emails where fingerprint = v_fp;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return false; end if;
  insert into public.security_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'email_unbanned', 'banned_email', null, left(v_fp, 8));
  return true;
end;
$$;

revoke all on function public.admin_unban_email(text) from public, anon;
grant execute on function public.admin_unban_email(text) to authenticated, service_role;

-- ───────── Cron ─────────
-- cron.schedule con un nombre existente actualiza ese job (pg_cron 1.6): idempotente sin cron.unschedule previo.
select cron.schedule('retention-purge', '45 4 * * *', $$select public.retention_purge()$$);
