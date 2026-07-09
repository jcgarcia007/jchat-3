# Prompts para Claude Code — Remediación Auditoría 1+2

> Ejecutar EN ORDEN. El PROMPT A va solo y se verifica antes de seguir (es el
> único con riesgo de romper `select *` del cliente). Después el B y el C.
> Recuerda: si Claude Code cae en `mobile/`, corre `git rev-parse --show-toplevel`
> y `cd` a la raíz `/Users/jcgarcia/Projects/JchatVer3.0`.

---

## PROMPT A — Cerrar la fuga de `password_hash` y `qr_token` en `rooms` (CRÍTICO, commit aislado)

```
Contexto: la tabla public.rooms expone las columnas password_hash y qr_token a los
roles anon y authenticated vía GRANT de columnas + una policy SELECT con qual=true.
Esto permite que cualquiera lea el qr_token y entre a cualquier sala sin presencia
física (rompe la regla de oro de geo). Hay que cerrarlo SIN romper el flujo legítimo
del owner que necesita ver el qr_token en el dashboard.

Tarea (una migración nueva + verificación):

1. Crea una migración `044_lockdown_rooms_columns.sql` con:
   - REVOKE SELECT (password_hash, qr_token) ON public.rooms FROM anon, authenticated;
   - Endurece la policy "rooms: authenticated read": cámbiala para exigir que la sala
     esté activa (is_active = true). Mantén lectura pública del resto de columnas
     (name, icon, theme, etc.) porque el cliente las necesita.
   - Crea un RPC SECURITY DEFINER `get_room_qr_token(_room_id uuid) returns text`
     que devuelva el qr_token SOLO si auth.uid() es el owner del negocio de esa sala
     (o platform admin vía is_platform_admin()). REVOKE EXECUTE de anon; GRANT a
     authenticated.

2. Busca en web/ y mobile/ TODAS las queries que hagan `.from('rooms').select('*')`
   o que seleccionen password_hash / qr_token directamente. Reemplázalas por selects
   de columnas explícitas SIN esas dos columnas. Donde el dashboard del owner necesite
   el qr_token, cámbialo para llamar el RPC get_room_qr_token(room_id).

3. Corre `npx tsc --noEmit` en web/ y en mobile/ sobre los archivos tocados.

4. Aplica la migración con Supabase MCP, luego verifica con:
   - Un select de qr_token como authenticated debe fallar (permiso denegado).
   - El RPC get_room_qr_token como owner debe devolver el token; como otro usuario
     debe devolver null/negar.

Commit: "sec: lockdown rooms.password_hash + qr_token (S1) + owner-only qr RPC".
NO toques nada más en este commit. Reporta el SHA.
```

---

## PROMPT B — Endurecer funciones + auth + storage (después de verificar A)

```
Contexto: remediación S2, S3, S5, S6, S7 de la auditoría de seguridad. Una sola
migración `045_harden_functions_storage.sql` + dos toggles manuales que me indicas.

Tarea:

1. En la migración:
   - REVOKE EXECUTE FROM anon (y de authenticated donde indico) en estas funciones,
     que NO deben ser llamables por API pública:
       * de cron/trigger (revoke a anon Y authenticated):
         purge_expired_messages(), enforce_business_limit(),
         enforce_business_radius_cap(), enforce_service_call_cooldown(),
         trg_fn_assign_room_qr_token()
       * admin (revoke a anon; authenticated las conserva pero tienen guard):
         admin_set_business_status(uuid,text)
       * requieren identidad (revoke SOLO a anon; authenticated las usa):
         set_room_password(uuid,text), remove_follower(uuid), block_user(uuid),
         unblock_user(uuid), request_or_follow(uuid), accept_follow_request(uuid),
         start_dm(uuid), regenerate_room_qr_token(uuid), generate_room_qr_token(uuid,boolean)
     (Deja públicas: join_room_via_qr, resolve_room_qr, username_available,
      verify_room_password, can_access_room, is_platform_admin, is_blocked,
      can_view_profile, can_view_user_content — el cliente/anon las necesita.)
   - Marca STABLE (no volatile) los helpers de lectura: is_blocked, can_view_profile,
     can_view_user_content, can_access_room (mejora el planner; ver PROMPT C).
   - Recrea la vista public_profiles con security_invoker = true (Postgres 15+) y
     SOLO las columnas mínimas y públicas (id, username, display_name, avatar_url,
     is_verified, profile_theme_id). Que respete is_private/showCity: no exponer city
     salvo que privacy lo permita (si es complejo, deja city fuera de la vista por ahora).
   - processed_stripe_events: agrega una policy explícita
     `create policy "deny all" on public.processed_stripe_events for all to anon,
      authenticated using (false) with check (false);`
     (service_role la sigue usando por bypass de RLS).
   - Buckets: quita la policy de listing amplia de menu-photos y profile-media
     (mantener solo acceso por URL pública, sin list). Para voice-notes: cámbialo a
     bucket privado y crea policy de signed-URL como dm-media.

2. Verifica con Supabase MCP que anon ya no puede ejecutar las funciones revocadas
   y que public_profiles ya no es security definer (get_advisors security).

3. Indícame los DOS toggles manuales de dashboard que debo activar yo:
   - Auth → Password security → leaked password protection (HaveIBeenPwned) ON.
   - Auth → rate limits (confirmar valores por defecto sensatos).

Commit: "sec: harden SECURITY DEFINER grants, public_profiles invoker, storage listing, stripe-events policy (S2/S3/S6/S7)".
Reporta SHA + el resultado de get_advisors security después.
```

---

## PROMPT C — Escalabilidad: initPlan en RLS + sort bigint

```
Contexto: remediación E1 y E5. Las policies RLS re-evalúan auth.uid()/helpers por
fila; hay que envolver en (select ...) para initPlan. Y campos sort en int4 pueden
desbordar con Date.now().

Tarea (migración `046_rls_initplan_and_sort_bigint.sql`):

1. Reescribe estas policies SELECT cambiando `auth.uid()` por `(select auth.uid())`
   dentro de las llamadas a helpers (mantén la lógica idéntica, solo el wrap):
   - posts_read, comments_read, post_likes_read (posts p.user_id ...)
   - follows_read (can_view_profile((select auth.uid()), ...))
   - dm_conv_read, dm_msg_read (el CASE de is_blocked)
   - messages "authenticated read" (can_access_room usa auth.uid() internamente;
     revisa si conviene pasar (select auth.uid()) o dejarlo — documenta la decisión)

2. Audita columnas de ordenamiento tipo int4 que puedan recibir Date.now():
   busca en migraciones y schema columnas sort/position/order/index en tablas como
   posts, messages, menu_items, menu_categories, rooms, modifier_groups. Las que sean
   integer y se llenen con timestamps → ALTER a bigint. (No cambies las que usan
   valores pequeños incrementales.)

3. Corre EXPLAIN sobre un select de posts_read con un usuario de prueba para confirmar
   que el helper se evalúa como initPlan (una vez) y no per-row.

Commit: "perf: RLS initPlan wrap + sort columns to bigint (E1/E5)".
Reporta SHA.
```

---

## Después de aplicar

Cuando Claude Code reporte los 3 SHAs, pásamelos y los audito uno por uno con
get_commit + get_advisors, y actualizo docs/PROJECT_STATUS.md + docs/SECURITY_AUDIT.
