# Migraciones reproducibles — baseline (rama `chore/migrations-baseline`)

**Objetivo:** que el repo pueda crear una base NUEVA (local y ramas de Supabase) con el CLI real. Producción no se toca: su historial de migraciones
va por fechas (`20261027012309_244_…`, aplicadas por MCP) y el del repo por números; nunca han coincidido y no se usa `db push`. Por eso no hay
ningún `migration repair`: el baseline no se ejecuta nunca en producción.

## Estructura final

```
supabase/
  migrations/
    245_baseline.sql          ← esquema de producción a 2026-10-27 (último aplicado allí: 244), sin el esquema `otunity`
    246_baseline_extras.sql   ← lo que el volcado no trae: 9 buckets, 26 políticas de storage.objects, 11 crons, trigger on_auth_user_created
  migrations_archive/         ← las 241 migraciones 001…244, `git mv`, nombres intactos (033×2, 034×2, 173a, 173b, 198, 198c)
    README.md                 ← «es historial; el CLI no lo lee»
```

- Los números repetidos y los sufijos solo existen en `migrations_archive/`, que el CLI no lee: desaparece el error de versión duplicada sin renombrar nada.
- Los archivos que citaban `supabase/migrations/NNN_*.sql` (tests estáticos, comentarios, docs, `loadtest/`, `CLAUDE.md`, scripts de comprobación) apuntan ahora a
  `migrations_archive/`. `migrations-businesses-grants.test.mjs` lee el archivo y, además, las migraciones nuevas (247+) de `migrations/`.

## Regla para el futuro

> **Las migraciones nuevas se numeran desde la 247, en `supabase/migrations/`.** Producción las sigue aplicando Juan Carlos por MCP (historial por
> fechas; no se usa `db push`). Nada nuevo entra en `migrations_archive/`. Si hace falta rehacer el baseline (producción cambió por SQL Editor),
> se vuelve a volcar, se revisa como la primera vez y se sustituye el 245 (la 246 se revisa con él).

## Revisión del volcado (`supabase db dump --linked`, esquema sin datos)

Veredicto: limpio para el repo.

| Comprobación | Resultado |
|---|---|
| Datos (`COPY`, `INSERT INTO`) | 0 |
| Roles / contraseñas | 0 (las apariciones de "password" son `set_room_password` / `verify_room_password` / la columna `password_hash`) |
| Claves / tokens (JWT, `sk_`, `pk_`, `whsec_`, `Bearer`) | 0 |
| Vault | 8 lecturas de `vault.decrypted_secrets where name = 'push_webhook_secret'`: solo el nombre, ningún valor |
| Configuración de Auth, correos, UUID literales, nombres de personas | 0 |
| Contenido | 106 tablas `public`, 278 funciones, 202 policies, 193 índices, 120 funciones-trigger, 6 extensiones, 16 `ALTER PUBLICATION`, 1034 `GRANT` |

Avisos que siguen vigentes:

- **5 funciones-trigger llevan la URL de funciones de producción** (`https://klfsgcfoahdtkojyqspd.supabase.co/functions/v1/{gift-worker, moderate-dm-photo,
  moderate-match-photo, safety-alert, send-push}`). Son disparadores que leen `push_webhook_secret` del vault; una base nueva sin ese secreto sale sin hacer nada
  (así corren los tests locales), pero **una rama o un entorno con el secreto cargado llamaría a producción**. Tarea aparte: leer la URL de un ajuste.
- **Extensiones:** `pg_cron`, `pg_net`, `pg_stat_statements`, `pgcrypto`, `supabase_vault`, `uuid-ossp` (las imágenes locales y las ramas las traen).
- **`246` usa `drop policy/trigger if exists` y `cron.unschedule … where exists`**: es la forma que dejó producción de «idempotente» para bases nuevas. No contradice la
  regla de no destruir en migraciones: solo toca objetos que el propio archivo crea, en una base vacía.

## Esquema `otunity`: fuera del baseline

Comprobado: **ninguna función, vista, trigger ni política de `public` usa el esquema `otunity`**. Solo aparece la palabra `'otunity'` como texto dentro de la lista de
subdominios reservados (un literal, no el esquema). Todo lo demás son sus propias 4 tablas (`app_links`, `owners`, `solutions`, `subscriptions`), sus 8 políticas, sus
claves foráneas (entre tablas de `otunity`), sus permisos y los `ALTER DEFAULT PRIVILEGES`: 47 sentencias, quitadas. Diferencia con el volcado: −4 tablas, −8 políticas,
−11 `GRANT`, −18 `ALTER TABLE`; el resto idéntico (278 funciones, 193 índices, 60 `COMMENT`, 251 `REVOKE`).

## Por qué hacía falta (las 15 migraciones que fallaban al reproducir desde cero)

| Migraciones | Falta | Causa |
|---|---|---|
| 036, 038 | `businesses.event_ends_at` | la crea la 108 (orden) |
| 046 | `enforce_business_limit()` | la crea la 068 (orden) |
| 066 | `users.active_business_id` | la crea la 107 (orden) |
| 147, 154, 164, 165, 166 | tabla `pos_payments` | ninguna migración la crea (a mano) |
| 118, 183 | tabla `affiliates` | ninguna migración la crea |
| 159 | `businesses.kds_settings` | ninguna la crea |
| 160 | función `pos_can_access` | ninguna la crea |
| 161 | `tables.session_opened_by` | la añade la 160, que falla |
| 163 | `orders.canceled_at` | ninguna la añade |

## Prueba en LOCAL con el CLI real

`bash loadtest/local-up.sh` (`supabase start` con `supabase/migrations`, y `supabase db reset` si ya estaba levantado). Ambos, sin errores:

- migraciones aplicadas: `245`, `246`
- 106 tablas y 278 funciones en `public` · 9 buckets · 26 políticas de storage · 11 crons · 1 trigger en `auth.users`
- `bash loadtest/run-sql-tests.sh` (`supabase/tests/`): **112 pasan, 0 fallan, 0 omitidos**
- `tsc` limpio · todos los `scripts/*.test.mjs` de Node pasan · specs herméticos (`e2e/local`): 39 pasan, 1 omitido (el de `payment_failures`, que vive en otra rama)

## Riesgos

1. **Divergencia:** el volcado es una foto. Si producción cambia por SQL Editor y no se refleja en una migración 247+, las bases nuevas se alejan. Vigilar al aplicar por MCP:
   cada cambio en producción debe entrar también como archivo `247_…` en `supabase/migrations/`.
2. **Ejecutar el baseline en producción** (p. ej. un `db push` por error): no hay historial alineado, así que el CLI intentaría los dos archivos. Casi todo es `IF NOT EXISTS` /
   `OR REPLACE`, pero un `CREATE POLICY` repetido aborta. Por eso `db push` no se usa contra producción.
3. **URL de producción** dentro de 5 funciones (ver arriba) si un entorno nuevo carga el secreto.
4. **`246`** crea buckets y políticas con los mismos nombres que producción: una rama de Supabase los tendrá, con su propio vault vacío (los envíos de push no funcionarán hasta crear `push_webhook_secret`).
