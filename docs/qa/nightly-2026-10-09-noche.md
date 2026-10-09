# Tanda nocturna 2026-10-09 — informe por bloque

Reglas respetadas: nada en `main`; nada desplegado (ni funciones ni web); **ningún SQL aplicado** (todo en `supabase/migrations/pending/`); ninguna
llave impresa; no se cerró sesión en los simuladores; no se borraron cuentas ni se cambiaron contraseñas; solo la tarjeta 4242 (no hubo pagos esta noche).
Cada bloque en su propia rama desde `origin/main`. Para los bloques de código: `tsc` mobile = 0, `tsc` web = 0, build web OK (verificado antes de subir).

## Resumen rápido
| Bloque | Rama | Estado |
|---|---|---|
| 1 Paridad del chat web | `fix/web-chat-parity` | ✅ hecho y subido |
| 2 Fotos de DM difuminadas (D2-D) | `feat/dm-photo-moderation` | ✅ escrito y subido; **SQL y función sin aplicar/desplegar** |
| 3 Runbook CSAE | `docs/csae-runbook` | ✅ borrador subido (requiere revisión legal) |
| 4 Pruebas nocturnas | `test/nightly-safety` | ⚠️ **parcial: solo Android** (iOS sin sesión) |
| 5 Usuarios de prueba | `feat/seed-test-users` | ✅ scripts escritos y subidos, **no ejecutados** |

---

## Bloque 1 — `fix/web-chat-parity`
- **SHA:** `57be336` (anclaje abajo) · `3157b2b` (inventario).
- **Archivos:** `web/app/c/[token]/room/ChatRoom.tsx`; `docs/proposals/web-chat-parity.md`.
- **Qué se hizo:** con pocos mensajes la lista queda anclada ABAJO, junto a la caja de escribir (espaciador flexible que se encoge a 0 cuando los mensajes llenan el área; el auto-scroll al último, la carga y el estado vacío no cambian). Inventario de lo que tiene el chat del local en la app y no la web, con esfuerzo por punto y orden sugerido (primero mensaje fijado + ofertas, luego tarjeta rápida/silenciado, voz, notificaciones/pedidos; DM, regalos y Match como "descarga la app").
- **Verificado:** `tsc` web 0 y build OK. **No** se probó en pantalla.
- **Pendiente / Juan:** revisar el inventario (es por lectura de código; los esfuerzos son estimaciones). Nada que desplegar aparte del merge de la web.

## Bloque 2 — `feat/dm-photo-moderation` (D2-D)
- **SHAs:** `cd03651` (extracción de SafeSearch) · `78085d5` (SQL + función) · `9aa6c29` (móvil).
- **Archivos:**
  - `supabase/functions/_shared/safesearch.ts` (nuevo: `safeSearch`, `toBase64`, `rank`, la decisión de Match movida **tal cual** y la nueva `decideDmPhoto`) y `supabase/functions/moderate-match-photo/index.ts` (ahora importa de ahí; mismo comportamiento).
  - `supabase/functions/moderate-dm-photo/index.ts` (nueva) y `supabase/config.toml` (`verify_jwt = false`).
  - `supabase/migrations/pending/214_dm_photo_moderation.sql` (**NO aplicada**).
  - `mobile/screens/dms/DMChatScreen.tsx`, `mobile/services/dms.ts`, `mobile/i18n/locales/{en,es}/common.json`, tipos `web/lib/database.types.ts` y `mobile/services/database.types.ts` (parcheados a mano).
- **Qué hace:** una foto de DM nunca se bloquea al enviar. Un trigger la marca `pending`; una Edge Function (mismo secreto `x-push-secret`) la mira con Vision y fija el veredicto con el RPC `dm_photo_set_verdict` (solo `service_role`): `clear`, `blurred` (adulto LIKELY/POSSIBLE, racy/violencia LIKELY+) o `rejected` (adulto VERY_LIKELY). `rejected` crea un **reporte urgente del sistema** (`dm_message`, motivo `sexual_content`, sin ninguna URL en el snapshot) y un registro en `security_logs`. Cron de reintento para `pending` > 5 min. El receptor ve `pending`/`blurred` difuminadas con "Ver de todos modos" y "Reportar"; `rejected` no se muestra (con "Reportar"); quien envía ve su foto normal; el UPDATE de realtime aplica el veredicto en el sitio. La web no muestra DMs, así que no se tocó.
- **Verificado:** `deno check` de ambas funciones OK; prueba en Deno de las dos tablas de decisión (**11 casos OK**: 8 de DM y 3 de Match, que confirman que Match no cambió); `tsc` mobile 0, `tsc` web 0, build web OK; paridad i18n (77/77). **No** se probó el SQL ni el flujo real (no se puede aplicar nada).
- **Cosas que Planning debe revisar en el SQL:** (1) `reports.reporter_id` pasa a admitir NULL (reportes del sistema); (2) requiere la **212 ya aplicada** (sí lo está); (3) límite conocido: un cliente modificado aún podría pedir la URL firmada de una foto `rejected` (las políticas de `dm-media` no miran el veredicto).
- **Qué debe hacer Juan (en orden):** 1) Planning revisa y aplica `214_dm_photo_moderation.sql`; 2) `supabase functions deploy moderate-dm-photo --project-ref klfsgcfoahdtkojyqspd --no-verify-jwt` (usa los secretos que ya existen: `PUSH_WEBHOOK_SECRET`, `GOOGLE_VISION_API_KEY`); 3) como `moderate-match-photo` cambió de archivo (mismo comportamiento), redesplegarla también; 4) merge de la rama (la app nueva funciona con la columna ausente: trata `null` como "sin veredicto"). Cómo probar y revertir: en el encabezado del SQL.

## Bloque 3 — `docs/csae-runbook`
- **SHA:** `fd288c7`. **Archivo:** `docs/safety/csae-runbook.md` (en español, marcado **"BORRADOR — requiere revisión legal"**).
- **Contiene:** responsables, revisión de `child_safety` < 24 h, no ver/descargar/reenviar, preservación de evidencia (`reports.snapshot`, contenido oculto con `admin_hide_content`, nunca borrar), suspensión con `admin_suspend_user`, pasos de la CyberTipline de NCMEC (incluido el registro previo como ESP), `security_logs`, plantilla de bitácora, estado técnico y pendientes.
- **Dos cosas que el borrador señala y que NO decidí yo:** (a) el plazo de conservación: se pidió **90 días**, pero el **REPORT Act (2024)** lo amplió a **1 año** — el borrador recomienda 1 año y lo marca **[CONFIRMAR]** con el asesor; (b) el **autoborrado de cuenta** destruye contenido y reportes por cascada: falta un "legal hold" (anotado como brecha técnica).
- **Verificado:** nada ejecutable. **Juan:** nombrar responsable y suplente, revisarlo con su asesor, registrar a Otunity Labs LLC como ESP en NCMEC.

## Bloque 4 — `test/nightly-safety`
- **SHAs:** `70cc094` · `a854597` · `225e091` · `a2b1573`.
- **Archivos:** `e2e/maestro/flows/19-reportar-mensaje-chat.yaml`, `19-reportar-mensaje-chat-ios-envia.yaml` (par iOS), `19b-reportar-mensaje-historial.yaml`, `20-bloquear-en-dm.yaml`, `20b-restaurar-desbloqueo.yaml`; `e2e/nightly.sh` (fase 6 con 19/19b/20); `e2e/preflight.sh` + `e2e/maestro/helpers/preflight-open.yaml`; `e2e/maestro/helpers/open-app.yaml`, `leave-venue.yaml`; `e2e/run.sh`.

### Lo que NO se pudo hacer, y por qué
1. **El simulador de iPhone está SIN SESIÓN** (muestra "Comenzar / Iniciar sesión"). No lo cerré yo; el login necesita hCaptcha y no puedo resolverlo. **Por eso no corrió nada de iOS**: ni la regresión 01–18, ni el par 19 (iOS escribe, Android reporta), ni 04/05/06/09/16 (necesitan los dos), ni la resistencia de 40 min. **Juan:** iniciar sesión con `test1` en el simulador y dejarme repetir la corrida.
2. `e2e/nightly.sh` completo no llegó a correr: su **preflight fallaba** y marcaba todo como omitido. Causa raíz (arreglada): `open-app.yaml` declaraba `METRO_HOST`/`METRO_PORT` por defecto en su cabecera y ese valor **pisaba el `-e`** de la línea de comandos; solo pasaba cuando había un Metro en 192.168.1.227:8081 (el de Juan). Se quitó la cabecera, `run.sh` pone los valores por defecto y el preflight usa un envoltorio. **No volví a lanzar el `nightly.sh` completo con el arreglo** (sin iOS no tiene sentido); corrí los flujos de Android directamente con `e2e/run.sh`.
3. El driver de Maestro de Android se colgó otra vez ("did not start up in time"); se arregló reiniciando el emulador (sin cerrar sesión), como en la noche anterior.

### Resultados (solo Android, cuenta `test`)
| Flujo | Resultado |
|---|---|
| 01 sesión del local | ✔ (falló una vez: el helper no confirmaba el aviso "¿Salir del local?" de Android → arreglado; repetido ✔) |
| 02 fuera del área | ✔ |
| 11 perfil propio | ✔ |
| 14 Cerca de mí / Ofertas | ✔ |
| 15 Ajustes y privacidad | ✔ |
| 17 mapa | ✔ |
| 18 ofertas | ✔ |
| **19b reportar un mensaje del chat** (mantener pulsado → Reportar mensaje → motivo "Spam o estafa" → "Lo revisamos en menos de 24 h") | ✔ |
| **20 bloquear desde un DM** (⋯ → Bloquear → confirmar → la conversación desaparece tras recargar → desbloquear → vuelve) | ✔ (tras ajustar el flujo; ver hallazgo 1) |
| 20b restaurar el desbloqueo | ✔ |
| 03, 04, 05, 06, 08, 09, 10, 16, 19 (par), 12, 13 | **no corridos** (necesitan iOS o pagos en dos dispositivos) |

### Hallazgos
1. **(Media) Al bloquear desde un DM, la conversación sigue apareciendo en Mensajes** hasta reiniciar la app: al volver atrás, e incluso al salir de la pestaña y volver, la lista no se recarga. El servidor **sí** la oculta (tras reabrir la app aparece "Aún no hay conversaciones"). Captura: `e2e/out/android-20-bloquear-en-dm-20261009-004626/.../03-tras-bloquear.png` (no se versiona). Arreglo probable: recargar la lista de conversaciones al enfocar la pestaña o al volver del DM bloqueado. **No lo toqué.**
2. (Baja, de pruebas) El tap por texto sobre alertas nativas de Android es ambiguo (el botón va en mayúsculas y el texto también coincide con elementos de detrás): los flujos 20/20b y el helper de "salir del local" confirman por posición. La fila "Usuarios bloqueados" de Privacidad no tiene texto accesible propio.
3. (Entorno) iOS sin sesión y driver de Maestro de Android colgándose; ver arriba.

### Limpieza de datos (solo lo creado por la cuenta de pruebas en esta corrida)
- **Reporte creado y borrado:** `69f4c12f-23e2-4e0c-9238-5b7cf381d25d` (mensaje, motivo `spam`, reportero `test`, 2026-10-09 05:02 UTC). Borrado con filtro `reporter_id = test` y fecha ≥ inicio de la corrida.
- Los **3 reportes anteriores** (`7d7e22e2…`, `afaeea18…`, `6cb8d145…`, creados por `test1` la noche del 8) **siguen intactos**.
- **Bloqueos:** `test` bloqueó a `test1` durante los flujos 20/20b y quedó desbloqueado al terminar (0 bloqueos; 0 seguimientos entre ambos, igual que al empezar).
- Ningún reporte `child_safety` (los flujos nunca eligen ese motivo, para no disparar correos a safety@).

### Estado final de los dispositivos
- **Android:** con sesión de `test`, fuera del chat (tras el flujo 01 salió del local), ubicación en Bar XZX.
- **iOS:** **sin sesión** (ver arriba). No lo toqué.

## Bloque 5 — `feat/seed-test-users`
- **SHA:** `204ee09`. **Archivos:** `scripts/test-users/{lib,seed,simulate,cleanup}.mjs`, `scripts/test-users/README.md`, `supabase/migrations/pending/215_test_users_flag.sql` (**NO aplicada**).
- **Qué hay:** `seed` (N usuarios `<nombre>NN@test.jchat.cloud`, contraseña aleatoria solo en `out/credentials.json` git-ignorado y con `chmod 600`, 18+ vía `confirm_age`, avatar DiceBear re-alojado en nuestro bucket, `--dry-run`/`--count`/`--venue`); `simulate` (chat del local, DM, publicaciones y likes **con la sesión de cada usuario**, así que RLS aplica y los rechazos se cuentan, no se rodean); `cleanup` (borra solo `@test.jchat.cloud`, dry-run por defecto, omite dueños de negocio, tope `--max`).
- **Verificado:** solo la sintaxis (`node --check`). **No se ejecutó ninguno de los tres**, ni siquiera en dry-run, como pediste.
- **Riesgos que el README explica:** (1) apuntan al proyecto de `web/.env.local` — si es producción, `seed`/`simulate` crean datos reales ahí; (2) la sesión sin contraseña usa un enlace mágico canjeado con `verifyOtp` para esquivar hCaptcha: **no se pudo comprobar** que tu proyecto lo permita; (3) `simulate` manda la posición del local a la geocerca (el mismo mecanismo de los simuladores).
- **Juan:** opcionalmente aplicar `215` (`users.is_test`, solo `service_role`) antes del `seed`.

---

## Qué debe hacer Juan (orden)
1. **Iniciar sesión con `test1` en el simulador de iPhone** (para repetir la regresión completa y el par 19).
2. **Planning:** revisar y aplicar `214_dm_photo_moderation.sql` (y, si quiere los usuarios de prueba, `215_test_users_flag.sql`).
3. **Desplegar** `moderate-dm-photo` y `moderate-match-photo` (esta última solo por el cambio de archivo, mismo comportamiento).
4. **Merge** de `fix/web-chat-parity`, `feat/dm-photo-moderation` (después de 2 y 3 para ver el efecto), `docs/csae-runbook`, `test/nightly-safety` y, si quiere, `feat/seed-test-users`.
5. **Decidir** sobre el hallazgo 1 (lista de DM que no se recarga al bloquear) y revisar el runbook CSAE con su asesor (plazo de conservación 90 días vs 1 año).
