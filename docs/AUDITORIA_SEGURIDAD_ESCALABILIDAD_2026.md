# JChat 3.0 — Auditoría Senior · Parte 1 (Seguridad) + Parte 2 (Escalabilidad)

> Fecha: 2026-07-09 · Auditor: Planning Claude (rol programador senior)
> Método: lectura de código vía GitHub MCP + queries en vivo a Supabase
> (`klfsgcfoahdtkojyqspd`) + `get_advisors`. **Todo hallazgo aquí fue verificado
> contra la BD/código real, no contra los docs** (que en algún punto estaban
> desactualizados — ver nota Stripe).
>
> Severidad: 🔴 CRÍTICO (bloqueante de lanzamiento) · 🟡 IMPORTANTE (antes de
> escalar / abrir al público) · 🟢 MEJORA (deuda sana).

---

## Resumen ejecutivo

**Estado general: mejor de lo que los docs sugerían, con 2 huecos críticos reales.**

El trabajo de seguridad de pagos del 2026-07-08 quedó sólido y verificado en vivo
(firma de webhooks ACTIVA, idempotencia bien hecha, passwords bcrypt, lockout de
fuerza bruta ya existente). Los índices de BD están sorprendentemente bien puestos
para el volumen de lanzamiento. Pero hay **dos cosas que hay que arreglar sí o sí
antes de dejar entrar usuarios reales**, y un conjunto de endurecimientos que deben
ir antes de escalar.

| # | Hallazgo | Sev | Área |
|---|----------|-----|------|
| S1 | `rooms` expone `password_hash` **y `qr_token`** a cualquiera (incl. anónimo) | 🔴 | RLS/IDOR |
| S2 | ~30 funciones SECURITY DEFINER ejecutables por `anon` sin necesidad | 🟡 | Superficie |
| S3 | `public_profiles` es SECURITY DEFINER view (linter ERROR) | 🟡 | RLS bypass |
| S4 | Sin rate limiting en Edge Functions ni RPCs | 🟡 | Abuso/DoS |
| S5 | Leaked-password protection desactivado (HaveIBeenPwned) | 🟡 | Auth |
| S6 | 3 buckets públicos permiten *listing* (`voice-notes` es el peor) | 🟡 | Storage |
| S7 | `processed_stripe_events` RLS on sin policy (limpieza) | 🟢 | Config |
| E1 | RLS policies re-evalúan `auth.uid()`/helpers **por fila** (no `(select …)`) | 🟡 | Escala |
| E2 | Feed hace `IN (followingIds)` armado en cliente | 🟡 | Escala |
| E3 | Contadores follower/like via `count(*)` (ok en v1, plan de denorm listo) | 🟢 | Escala |
| E4 | Presence de Supabase Realtime: límites a vigilar en salas llenas | 🟡 | Escala |
| E5 | `Date.now()` en campos `sort` puede desbordar int4 (deuda conocida) | 🟡 | Bug latente |
| E6 | `order_items` puede quedar vacío si falla su insert post-pago | 🟢 | Integridad |

---

# PARTE 1 — SEGURIDAD

## 🔴 S1 — `rooms.password_hash` y `rooms.qr_token` expuestos a cualquiera

**El hallazgo más serio de toda la auditoría.**

La policy `rooms: authenticated read` tiene `qual = true`, y los `GRANT SELECT`
a nivel de columna incluyen **todas** las columnas — incluidas `password_hash` y
`qr_token` — tanto para `authenticated` como para **`anon`**.

Verificado en vivo:
```
grantee=anon           cols=… password_hash, qr_token …
grantee=authenticated  cols=… password_hash, qr_token …
```

**Por qué es crítico (más allá del hash):**
- El `password_hash` es bcrypt, así que exponerlo no es catastrófico de inmediato,
  pero es una fuga innecesaria que permite ataques offline dirigidos.
- **El `qr_token` es el problema grave.** En el propio diseño de producto
  (`BACKLOG.md` §Modelo de salas + §Regla de oro de geo) el QR = **prueba de
  presencia física** y `join_room_via_qr(token)` otorga membresía de 24h **sin
  verificar ubicación**. Si cualquiera puede `SELECT qr_token FROM rooms`, entonces
  cualquiera puede entrar a **cualquier sala** (incluidas las protegidas por
  password — el QR salta el password por diseño) **sin estar físicamente ahí**.
  Esto rompe la regla de oro del producto y es un IDOR de acceso total al chat.

**Fix (en la migración de remediación):**
1. `REVOKE` de las columnas sensibles para `anon` y `authenticated`:
   ```sql
   revoke select (password_hash, qr_token) on public.rooms from anon, authenticated;
   ```
   (El owner sigue viendo su `qr_token` vía RPC/endpoint del dashboard con
   service_role o una función SECURITY DEFINER con guard de propiedad.)
2. Endurecer la policy `rooms: authenticated read` para que NO exponga salas de
   negocios ajenos más de lo necesario (mínimo: exigir sesión — hoy `anon` también
   lee). Recomendado: `qual = (is_active = true)` y mover la lectura del token a un
   RPC `get_room_qr(room_id)` con `assertOwnerOrAdmin`.
3. Confirmar que el cliente (móvil + web) obtiene el `qr_token` **solo** por el
   camino del dashboard (owner), nunca por un `select *` de rooms.

> ⚠️ Al aplicar el REVOKE, revisar que ninguna query del cliente haga `select *`
> sobre `rooms` esperando esas columnas — si lo hace, PostgREST devolverá error de
> permiso en esa columna. Hay que pedir columnas explícitas.

## 🟡 S2 — Funciones SECURITY DEFINER ejecutables por `anon`

`get_advisors` reporta ~30 funciones `SECURITY DEFINER` con `EXECUTE` para `anon`
y `authenticated`. Muchas **deben** ser públicas (`join_room_via_qr`,
`resolve_room_qr`, `username_available`, `verify_room_password`). Pero otras no
tienen razón de ser llamables sin sesión o por cualquiera:

- `admin_set_business_status` — solo super-admin (tiene guard interno, pero no debe
  ser llamable por `anon`).
- `set_room_password` — solo owner (tiene guard).
- `purge_expired_messages` — es un job de cron; nadie debe poder dispararlo.
- `remove_follower`, `block_user`, `unblock_user`, `request_or_follow`,
  `accept_follow_request`, `start_dm` — requieren identidad; deben ser
  `authenticated` únicamente, nunca `anon`.
- `enforce_*` / `trg_fn_*` — son **funciones de trigger**; no deberían tener
  `EXECUTE` para nadie vía API (`/rest/v1/rpc/…`).

**Riesgo real hoy:** BAJO — todas tienen guards con `auth.uid()`. Pero es
defensa-en-profundidad y superficie de ataque innecesaria (un bug futuro en un
guard se vuelve explotable).

**Fix:** `REVOKE EXECUTE … FROM anon` (y de `authenticated` en las de trigger/cron
y admin). Patrón:
```sql
revoke execute on function public.purge_expired_messages() from anon, authenticated;
revoke execute on function public.admin_set_business_status(uuid,text) from anon;
-- etc.
```

## 🟡 S3 — `public_profiles` view es SECURITY DEFINER

Linter nivel **ERROR**. Una vista SECURITY DEFINER corre con permisos del creador,
saltándose la RLS del que consulta. Si `public_profiles` fue creada para exponer un
subconjunto seguro de `users`, hay que confirmar exactamente **qué columnas**
expone y a quién, porque hoy podría estar mostrando más de lo que la RLS de `users`
permitiría. **Fix:** recrear como `security_invoker = true` (Postgres 15+) o como
vista normal con las columnas mínimas, y validar que respeta `showCity`,
`is_private`, etc.

## 🟡 S4 — Sin rate limiting

No hay rate limiting en ninguna Edge Function (`payments`, `stripe-connect`,
`subscriptions`, `stripe-webhook`) ni en los RPC sensibles. Un atacante puede:
- Martillar `verify_room_password` (hay lockout por usuario/sala, pero no por IP —
  un atacante con muchas cuentas evade el lockout por-usuario).
- Spam de `start_dm` / `request_or_follow` (acoso, enumeración).
- Abusar de `create_setup_intent`/`ensure_customer` (costo Stripe).
- Fuerza bruta de signups.

**Fix recomendado (presupuesto abierto):**
- **Supabase**: activar el rate limiting nativo de Auth (signups, OTP, etc.) en el
  dashboard — gratis.
- **Edge Functions**: middleware de rate limit por IP + user con **Upstash Redis**
  (free tier generoso; ~$10/mes si crece). Patrón: `@upstash/ratelimit`.
- **Cloudflare** delante de las Edge Functions / Vercel para WAF + rate limiting de
  borde (plan Pro ~$20/mes) — te da también protección DDoS y bot management.

## 🟡 S5 — Leaked password protection OFF

Toggle gratuito en Supabase Auth que valida passwords contra HaveIBeenPwned.
**Fix:** activarlo en Dashboard → Auth → Password security. 2 minutos.

## 🟡 S6 — Buckets públicos permiten listing

`menu-photos`, `profile-media`, `voice-notes` tienen una policy SELECT amplia que
permite **listar todos los archivos** del bucket (no solo acceder por URL directa).
`voice-notes` es el más sensible (audio de mensajes). **Fix:** quitar la policy de
listing amplia; para acceso por URL pública no se necesita `list`. Para
`voice-notes` considerar hacerlo privado + signed URLs (como `dm-media`).

## 🟢 S7 — `processed_stripe_events` RLS sin policy

RLS habilitado sin ninguna policy = solo service_role accede (que es lo correcto
para esta tabla). El linter lo marca como config incompleta. **Fix (cosmético):**
añadir un comentario o una policy explícita `deny all to public` para dejar la
intención documentada.

## ✅ Lo que YA está bien (no tocar, pero saberlo)

- Firma de webhook Stripe: `constructEventAsync` + rechazo 400. **ACTIVA** (el
  `DEPLOYMENT_CHECKLIST.md` dice que está "stubbed" — está **desactualizado**,
  corregir esa línea).
- Idempotencia webhooks: insert-first en `processed_stripe_events` + delete-on-error
  + unique parcial en `orders.stripe_pi_id`. Patrón correcto.
- `verify_room_password`: bcrypt + lockout de 5 intentos → 30 min por (sala,usuario).
- `set_room_password`: guard de propiedad (solo owner).
- RLS habilitado en el 100% de tablas public.
- Recálculo server-side de montos (P0-2) + orders solo por webhook.

## Sobre encriptación (tu interés especial)

**Lo que ya tienes gratis con Supabase:** cifrado at-rest AES-256 en disco +
TLS 1.2+ en tránsito. Eso cubre el 90% de lo que "encriptar todo" significa en la
práctica.

**Lo que NO recomiendo:** E2E (end-to-end) en DMs. Suena bien pero **choca con tu
propio spec**: §6.5 y la moderación requieren que el sistema sepa quién es quién
para Report/Block/moderación-IA, y con E2E puro el servidor no puede leer el
contenido para moderar. Además complica backup, búsqueda y multi-dispositivo. Para
una app social con menores-de-edad-excluidos pero UGC sensible, la capacidad de
moderar pesa más que el E2E.

**Lo que SÍ añade valor (cuando aplique):**
- `pgsodium` / Supabase Vault para cifrar a nivel de columna **datos ultra-sensibles
  específicos** si algún día los guardas: documentos de identidad de verificación,
  tokens de terceros, secretos de negocio. Hoy no tienes ese tipo de dato en claro
  (Stripe Identity maneja el KYC, tú no guardas el documento).
- Cerrar S1–S6, que es el riesgo **real** — mucho más impactante que cualquier capa
  extra de cifrado.

---

# PARTE 2 — ESCALABILIDAD

## 🟡 E1 — RLS re-evalúa `auth.uid()` y helpers por fila

Las policies de lectura nuevas (social) llaman los helpers directamente:
```sql
-- posts_read
can_view_user_content(auth.uid(), user_id, 'whoSeesMyPosts') AND NOT is_blocked(auth.uid(), user_id)
```
`auth.uid()` sin envolver en `(select auth.uid())` se marca como `VOLATILE`/`STABLE`
y Postgres lo re-evalúa **por cada fila**. Peor: `can_view_user_content` e
`is_blocked` son SECURITY DEFINER que hacen **subqueries internas** → una consulta
extra por fila candidata. En un feed de 20 posts es tolerable; en cualquier `SELECT`
amplio (listados, moderación, exports, o si un scraper pide muchas filas) se vuelve
O(n) de subqueries y tumba el rendimiento.

**Fix (estándar Supabase, bajo riesgo):** envolver en subselect para forzar
`initPlan` (se evalúa UNA vez):
```sql
-- antes
can_view_user_content(auth.uid(), user_id, 'whoSeesMyPosts')
-- después
can_view_user_content((select auth.uid()), user_id, 'whoSeesMyPosts')
```
Aplica a `posts_read`, `comments_read`, `post_likes_read`, `follows_read`,
`dm_conv_read`, `dm_msg_read`, `messages: authenticated read` (`can_access_room`).
Además, marcar los helpers `STABLE` (no `VOLATILE`) para que el planner los cachee
dentro del statement. Referencia: Supabase RLS performance guide (initPlan pattern).

## 🟡 E2 — Feed con `IN (followingIds)` armado en cliente

`listFeed(followingIds)` recibe los IDs de seguidos desde el cliente y hace un `IN`.
Problemas a escala: (1) un usuario que sigue a miles genera un `IN` gigante; (2) la
autoridad de visibilidad NO debe depender del array del cliente. Hoy la RLS reescrita
ya es la autoridad (bien), pero el patrón `IN` seguirá siendo el cuello.

**Fix evolutivo (no urgente para lanzar, sí para escalar):**
- v1 (ahora): dejar el `IN` pero **derivar `followingIds` server-side** (un RPC
  `get_feed(cursor)` que hace el join contra `follows` aceptados internamente).
- v2 (cuando el feed sea hot): tabla de **fan-out** o vista materializada; o
  paginación por keyset (`created_at < cursor`) en vez de `range/offset`.

## 🟢 E3 — Contadores via count(*)

`getFollowerCount`/`getLikeCount` usan `count(*)`. Con los índices
`follows(follower_id)` y `follows(following_id)` (que **ya existen** ✅) esto es
barato hasta decenas de miles de usuarios. El plan de denormalización
(`users.followers_count` por trigger) ya está documentado en
`PLAN_MAESTRO_SOCIAL.md` (decisión #6). **Acción:** ninguna ahora; ejecutar el plan
cuando el perfil sea hot. Correcto como está.

## 🟡 E4 — Supabase Realtime Presence en salas llenas

El chat de proximidad usa Realtime Presence (D-07). A vigilar:
- Presence hace broadcast del estado completo a todos los suscriptores en cada
  join/leave → en una sala con cientos de personas, el tráfico crece O(n²).
- Límites del plan de Supabase Realtime (conexiones concurrentes, mensajes/seg).

**Fix / plan:**
- Definir un tope práctico de presencia visible (ej. mostrar "120+ aquí" y solo
  trackear detalle de los primeros N) — ya anotado en el backlog para "typing…".
- Revisar el plan de Realtime antes de un venue grande; considerar
  `broadcast` con throttling en vez de presence-diff completo para conteos.
- Load-test con un venue simulado de 200–500 usuarios **antes** de un evento real.

## 🟡 E5 — `Date.now()` puede desbordar int4 en campos sort

Deuda ya conocida (`PROJECT_STATUS.md` DEBT). `Date.now()` (~1.75e12) desborda
`integer` de Postgres (máx 2.147e9). Si algún campo `sort`/`position` es `int4` y
recibe `Date.now()`, se rompe en runtime (ya pasó una vez en migr 029). **Fix:**
auditar todas las columnas `sort/position/order` → migrar a `bigint` o usar
`sequence`/`created_at`. Barato y evita un bug de producción silencioso.

## 🟢 E6 — `order_items` puede quedar vacío tras pago exitoso

En `stripe-webhook`, si el insert de `order_items` falla, el código **loggea y
continúa** (la orden existe sin ítems, para que el webhook devuelva 200 y Stripe no
reintente infinito). Es una decisión razonable, pero deja un estado raro para KDS.
**Fix sugerido:** guardar los ítems crudos en una columna jsonb de `orders`
(`items_snapshot`) como respaldo, para poder reconstruir si el insert relacional
falla. Bajo riesgo, alta tranquilidad para algo que mueve dinero.

---

## Orden recomendado de remediación (antes de usuarios reales)

**Tanda de seguridad crítica (1 migración + toggles de dashboard):**
1. S1 — REVOKE `password_hash`+`qr_token` + endurecer policy `rooms` + RPC de token
   para owner. **(bloqueante)**
2. S2 — REVOKE EXECUTE de funciones admin/cron/trigger para `anon`.
3. S3 — recrear `public_profiles` como security_invoker con columnas mínimas.
4. S5 — activar leaked-password protection (toggle).
5. S6 — quitar listing de buckets públicos; `voice-notes` → privado.
6. S7 — policy explícita en `processed_stripe_events`.

**Tanda de escalabilidad (1 migración, bajo riesgo):**
7. E1 — envolver `auth.uid()`/helpers en `(select …)` + marcar helpers STABLE.
8. E5 — migrar campos `sort` a bigint.

**Infra (config, no código):**
9. S4 — rate limiting (Supabase Auth nativo + Upstash/Cloudflare en Edge).
10. E4 — load-test de presence antes de un venue grande.

**No bloqueantes (evolutivos):** E2 (feed server-side), E3/E6 (cuando aplique).

---

## Nota de método

Todo lo anterior se verificó con queries en vivo el 2026-07-09. Los fixes de S1–S7
y E1/E5 son una sola pareja de migraciones que Claude Code puede aplicar; el
prompt copy-paste correspondiente acompaña este informe. **Recomiendo aplicar S1
como primer commit aislado** (es el único con riesgo de romper queries `select *`
del cliente) para poder verificarlo solo antes de seguir.
