# Migraciones reproducibles — plan del baseline (rama `chore/migrations-baseline`)

Estado: **preparación**. No se tocó producción, no se aplicó nada, el volcado NO está en el repo (sigue en `~/Downloads/prod-schema.sql`).

## (a) Revisión del volcado (`supabase db dump --linked`, 17 712 líneas, 685 KB)

Veredicto: **limpio para un repo, con tres avisos** (ninguno es un secreto).

| Comprobación | Resultado |
|---|---|
| Datos (`COPY`, `INSERT INTO`) | 0 |
| Roles / contraseñas (`CREATE ROLE`, `ALTER ROLE`) | 0. Las 18 apariciones de "password" son `set_room_password` / `verify_room_password` / `password_hash` (código y columna, sin valores) |
| Claves / tokens (JWT `eyJ…`, `sk_`, `pk_`, `whsec_`, `Bearer`, `api key`) | 0 |
| Vault | 8 lecturas `vault.decrypted_secrets where name = 'push_webhook_secret'`: **solo el nombre**, ningún valor. Extensión `supabase_vault` declarada |
| Configuración de Auth (SMTP, proveedores, JWT secret) | No hay: el volcado solo trae `public` y `otunity` |
| Correos, UUID literales, nombres de personas | 0 |
| `cron.schedule` | 0 (los trabajos de pg_cron son filas de `cron.job`, datos: no vienen) |
| Contenido | 106 tablas `public` + 4 `otunity`, 278 funciones, 210 policies, 193 índices, 120 funciones-trigger, 6 extensiones, 16 `ALTER PUBLICATION`, 1045 `GRANT` (a `anon`, `authenticated`, `service_role`, `postgres`) |

Avisos:

1. **URL de producción dentro de 5 funciones-trigger**: `https://klfsgcfoahdtkojyqspd.supabase.co/functions/v1/{gift-worker, moderate-dm-photo, moderate-match-photo, safety-alert, send-push}`. El ref del proyecto no es secreto (ya está en `supabase/config.toml` y en migraciones como la 202), pero un entorno nuevo con el secreto `push_webhook_secret` en su vault llamaría a producción. Sin ese secreto, las funciones salen sin hacer nada (así corren los tests locales). Recomendación: documentarlo; arreglarlo (leer la URL de un ajuste) es una tarea aparte.
2. **Esquema `otunity`** (`app_links`, `owners`, + 2 tablas): no es de JChat (es del hub de Otunity Labs en el mismo proyecto). Decisión tuya: incluirlo en el baseline (el repo reproduce el proyecto entero) o recortarlo (el baseline reproduce solo JChat).
3. **Extensiones**: `pg_cron`, `pg_net`, `pg_stat_statements`, `pgcrypto`, `supabase_vault`, `uuid-ossp`. Las imágenes locales y las ramas de Supabase las traen.

### Lo que el volcado NO trae (probado: una base reconstruida solo con él tiene 0 de cada cosa)

| Falta | Hoy lo crean | Cómo se resuelve |
|---|---|---|
| Buckets de Storage (filas) y **policies de `storage.objects`** (estado final tras 011, 024, 041, 042, 046, 061, 063…) | migraciones viejas | `supabase/scripts/baseline_extras_probe.sql` consultas 1 y 2 (solo lectura, las ejecutas tú en producción) → yo las convierto en la sección final del baseline |
| 11 trabajos de **pg_cron** (purga de chat, regalos, match, DM, truth-or-dare, venue exits…) | migraciones 043, 074, 085, 192, 193, 202, 205, 214, 222, 223, 237 | consulta 3 (**revisa los `command` antes de pegarlos**: si alguno lleva una clave, tápala) |
| Trigger `on_auth_user_created` en `auth.users` (crea la fila de `public.users`) | migración 048 | consulta 4 |
| Valor del secreto `push_webhook_secret` | a mano en cada entorno | consulta 5 (solo nombres). No se versiona nunca |

## (b) Estructura propuesta

**Opción recomendada (A) — squash con archivo histórico**

```
supabase/
  migrations/
    245_baseline.sql            ← volcado (public + otunity) + sección final: buckets/policies de storage, trigger de auth.users, cron
  migrations_archive/           ← las 241 migraciones actuales, `git mv`, nombres INTACTOS (033×2, 034×2, 173a, 173b, 198, 198c incluidos)
```

- **Número**: `245`, el siguiente al último aplicado (244). Las nuevas siguen: `246_…`. Sin renombrar nada de lo que ya existe.
- **Duplicados 033/034 y sufijos 173a/173b/198c**: viven solo en `migrations_archive/`, que el CLI no lee. Desaparece el error de `schema_migrations_pkey` sin renombrar ni una.
- **Producción**: su historial de migraciones hay que alinearlo con la carpeta (un solo `245` aplicado); ver (d). El esquema de producción no cambia.
- **Efecto en el repo**: varios archivos citan `supabase/migrations/NNN_*.sql` por ruta (tests estáticos como `gift-contract.test.mjs` y `gift-accept-tables.test.mjs`, comentarios de `messageFilter` y `useGeofenceGate`, `loadtest/`, `CLAUDE.md`, varios docs). Hay que apuntarlos a `migrations_archive/`; es mecánico pero toca esos archivos.
- **`loadtest/local-up.sh`** deja de necesitar el truco archivo-por-archivo: `supabase start` basta.

Alternativas descartadas:

- (B) *Dejar todo y poner el baseline en otra carpeta*: no toca el historial de producción, pero `supabase start` y las **ramas de Supabase** (que reproducen `migrations/`) siguen rotas, que es justo lo que queremos arreglar.
- (C) *Renombrar los duplicados y arreglar las 15 que fallan*: cambia versiones que producción ya tiene y las 15 dependen de objetos que ninguna migración crea (ver abajo): habría que inventar migraciones retroactivas.

### Las 15 migraciones que fallan al reproducir desde cero (y por qué)

| Migraciones | Falta | Causa |
|---|---|---|
| 036, 038 | `businesses.event_ends_at` | la crea la 108 (orden) |
| 046 | `enforce_business_limit()` | la crea la 068 (orden) |
| 066 | `users.active_business_id` | la crea la 107 (orden) |
| 147, 154, 164, 165, 166 | tabla `pos_payments` | **ninguna migración la crea** (se hizo a mano) |
| 118, 183 | tabla `affiliates` | ninguna migración la crea |
| 159 | `businesses.kds_settings` | ninguna la crea |
| 160 | función `pos_can_access` | ninguna la crea |
| 161 | `tables.session_opened_by` | la añade la 160, que falla |
| 163 | `orders.canceled_at` | ninguna la añade |

El baseline las supera todas porque parte del esquema real.

## (c) Prueba en LOCAL

`supabase start` (CLI real, carpeta de prueba `/tmp/jchat-baseline-test` con `migrations/245_baseline.sql` = el volcado tal cual):

- Arranca sin errores; `supabase_migrations.schema_migrations` = `245 baseline`.
- Resultado: 106 tablas, 278 funciones, 202 policies, 67 triggers en `public`.
- `bash loadtest/run-sql-tests.sh` contra esa base: **112 pasan, 0 fallan, 0 omitidos** (con el baseline desaparece también el skip de la 244 y `guest_device_blocks` existe).
- Confirmado lo que falta: 0 buckets, 0 policies de storage, 0 trabajos de cron, 0 triggers en `auth.users`.
- "Migraciones posteriores": aún no existe ninguna después de la 244; la 246 será la primera y se probará igual.

Para repetirlo: copia el baseline a una carpeta con `config.toml`, `supabase start --workdir <carpeta>`, y `SQL_TEST_CONTAINER=supabase_db_<project_id> bash loadtest/run-sql-tests.sh`.

## (d) Producción: alinear el historial (los ejecutas tú, después de revisar)

Lo que hace `supabase migration repair`: edita **solo** `supabase_migrations.schema_migrations`, la tabla de contabilidad del CLI. `--status reverted V` borra la fila de la versión V; `--status applied V` la inserta. No ejecuta ningún archivo ni cambia esquema ni datos.

No sé qué versiones tiene producción en esa tabla (según cómo se aplicaron: `001`…`244`, timestamps del MCP, o ninguna), así que los comandos se generan con la lista real:

```bash
# 1. Solo lectura:
supabase migration list --linked > /tmp/remote-migrations.txt
# 2. Imprime (NO ejecuta) los comandos exactos:
bash supabase/scripts/baseline_repair_commands.sh /tmp/remote-migrations.txt
```

La salida tiene este aspecto (versiones de ejemplo):

```bash
# A) quitar del historial todas las versiones remotas salvo el baseline
supabase migration repair --status reverted --linked 001 002 003 … 244      # (en bloques de 50)
# B) registrar el baseline como aplicado (ya está en producción: evita que `db push` lo intente)
supabase migration repair --status applied 245 --linked
# C) comprobar (solo lectura): las dos columnas deben mostrar solo 245
supabase migration list --linked
```

Orden obligatorio: (1) merge del baseline, (2) esos comandos, (3) comprobar. **No** ejecutes `supabase db push` antes del paso B.

## Riesgos

1. **`db push` antes del repair**: intentaría ejecutar el baseline sobre producción. Casi todo es `IF NOT EXISTS`/`OR REPLACE`, pero un `CREATE POLICY` repetido falla y aborta la transacción (sin daño). Aun así: repair primero.
2. **Repair equivocado**: un `--status applied` de más marca como aplicado algo que no lo está. Por eso el generador solo lista versiones que el propio `migration list` muestra.
3. **Divergencia**: el volcado es una foto; si producción cambia por SQL Editor antes de mergear, el baseline queda viejo. Hay que re-volcar y comparar justo antes del merge.
4. **Extras a mano** (storage, cron, trigger de auth): si se omiten, un entorno nuevo sube sin buckets, sin limpieza de datos y sin `public.users` automáticos. La sección final del baseline los cubre una vez ejecutes el probe.
5. **Rutas**: mover las 241 migraciones rompe los archivos que las citan por ruta hasta que se actualicen (hay tests que lo detectarían).
6. **Funciones con la URL de producción** (aviso 1): un entorno nuevo con el secreto cargado dispararía llamadas a producción.
7. **Historial de git**: `git mv` conserva el historial de cada archivo; nada se borra.

## Qué hace falta de ti

- Revisar (a) y decidir: ¿incluir `otunity`? ¿opción A?
- Ejecutar en producción (solo lectura) `supabase/scripts/baseline_extras_probe.sql` y pegarme los resultados (revisando los `command` de cron).
- Después: yo genero `245_baseline.sql` completo, muevo el archivo histórico, actualizo las rutas y vuelvo a probar en local; tú ejecutas los comandos de (d).
