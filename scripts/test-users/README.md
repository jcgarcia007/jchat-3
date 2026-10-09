# Usuarios de prueba (seed · simulate · cleanup)

> **Estado: escritos, NO ejecutados.** Nada de esto se ha corrido contra ninguna base de datos. Revisa los tres scripts y empieza
> por `--dry-run`.

Tres scripts para tener una población de usuarios de prueba en el entorno, con la actividad de una app viva, y poder borrarla sin
tocar nada real. Todos leen la llave de servidor **`SB_SECRET_KEY` de `web/.env.local`** (o del entorno) y **nunca la imprimen**.

| Script | Qué hace | Seguro por defecto |
|---|---|---|
| `seed.mjs` | Crea N usuarios `<nombre>NN@test.jchat.cloud` | `--dry-run` solo lista |
| `simulate.mjs` | Los hace entrar al local, escribir, mandarse DM, publicar y dar likes | `--dry-run` solo muestra el plan |
| `cleanup.mjs` | Borra SOLO usuarios `@test.jchat.cloud` (y su contenido por cascada) | **Dry-run es el modo normal**; borrar exige `--apply` |

## 1. `seed.mjs`
```bash
node scripts/test-users/seed.mjs --dry-run                         # lista lo que crearía
node scripts/test-users/seed.mjs --count 20 --venue bar-xzx        # crea 20 (por defecto 20; máx. 200)
```
- Crea cada cuenta con el correo `<nombre>NN@test.jchat.cloud` (ej. `lucia01@test.jchat.cloud`), correo ya confirmado, nombre, bio
  ("Cuenta de prueba · …") y **avatar generado** (DiceBear *adventurer*, un dibujo; **nunca fotos de personas reales**). El avatar se
  descarga una vez y se re-aloja en nuestro bucket `avatars` (`<id>/avatar.png`): la app no depende de DiceBear en tiempo de ejecución.
- **Contraseña aleatoria** (18 bytes, base64url) por usuario, guardada **solo** en `scripts/test-users/out/credentials.json`
  (carpeta `out/` ignorada por git; el archivo se escribe con `chmod 600`). No se imprime nunca.
- **Mayores de 18:** llama al RPC `confirm_age` *como el propio usuario* (año de nacimiento aleatorio entre 1985 y 1999; el servidor
  guarda solo el año) con el `TERMS_VERSION` actual de `web/lib/terms.ts`.
- `--venue <slug>` (por defecto `bar-xzx`): comprueba que el local existe y lo guarda en `credentials.json` para que `simulate` lo use.
- Es **idempotente**: si el correo ya existe no lo duplica (si falta en `credentials.json`, le pone una contraseña nueva).
- **Marca de prueba:** el dominio del correo siempre; y, si se aplica `supabase/migrations/pending/215_test_users_flag.sql`, además
  `users.is_test = true` (el script lo detecta solo). Sin esa migración funciona igual.

## 2. `simulate.mjs`
```bash
node scripts/test-users/simulate.mjs --dry-run
node scripts/test-users/simulate.mjs --minutes 10 --users 8 --actions chat,dm,post,like
```
Opciones: `--minutes` (5), `--users` (8, mínimo 2), `--actions` (`chat,dm,post,like`), `--venue`, `--min-gap`/`--max-gap` (ms entre acciones, 3000–9000).
- **Cada acción la hace el propio usuario con su sesión** (no con la llave de servidor), así que **RLS y las reglas del servidor aplican
  igual que en la app**. Si el servidor rechaza algo (enfriamiento, privacidad, presencia, límites) se cuenta y se reporta al final; **no se
  rodea**.
- Para actuar en el chat del local, cada usuario "entra" con `check_geofence_and_join_room` enviando la posición del local (la misma que
  mandan los simuladores con `adb emu geo fix`); se repite cada 4 min por el TTL de presencia.
- Acciones: `chat` (mensaje en la sala principal), `dm` (`start_dm` + mensaje), `post` (publicación de texto, sin foto), `like` (a una de las
  últimas 20 publicaciones).
- **Cómo abre sesión sin contraseña ni captcha:** Supabase Auth puede tener hCaptcha en el login con contraseña, que un script no puede
  resolver. Por eso `lib.mjs` pide con la API de admin un enlace mágico de un solo uso y lo canjea con `verifyOtp` (ese canje no lleva
  captcha); si falla, prueba la contraseña. **Esto no se pudo comprobar** (no se ejecutó): si tu proyecto lo bloquea, `simulate` avisa
  "no session for …" y no hace nada para ese usuario.
- Al final imprime una tabla `acción:resultado → n` (por ejemplo `chat:ok: 12`, `dm:42501: 3`).

## 3. `cleanup.mjs`
```bash
node scripts/test-users/cleanup.mjs            # DRY RUN: lista, no borra
node scripts/test-users/cleanup.mjs --apply    # borra
```
Reglas de seguridad:
- Coincidencia **exacta** del dominio `@test.jchat.cloud` (nunca una subcadena).
- Si existe `users.is_test`, además debe ser `true` (las cuentas con el dominio pero sin la marca se omiten y se avisa).
- **Omite** cuentas que sean dueñas de un negocio (borrarlas se llevaría el local).
- Tope `--max` (200 por defecto): si la lista es mayor, aborta.
- Para cada cuenta repite los pasos previos de `delete-account` (referencias `NO ACTION` de `radius_increase_requests`), borra su avatar y
  hace `auth.admin.deleteUser` (la cascada elimina perfil, mensajes, publicaciones, likes, DM…). Al terminar, si borró todo, elimina
  `credentials.json`.
- Los reportes, mensajes de otras personas y pedidos **no** de estas cuentas no se tocan; lo que las cuentas de prueba reportaron o
  escribieron se va con ellas por las claves foráneas `on delete cascade` (o queda anonimizado donde la clave es `set null`).

## Lo que debes saber antes de ejecutarlos
1. **Producción o no:** estos scripts usan la llave de servidor del proyecto configurado en `web/.env.local`. Si ese es el proyecto de
   producción, `seed` y `simulate` crean cuentas y contenido **reales en producción** (visibles en Bar XZX, notificaciones, métricas).
   Valora un proyecto/rama de pruebas o limpia justo después.
2. Los correos `@test.jchat.cloud` no existen como buzones: no recibirán nada (correo ya confirmado por el script).
3. Cuidado con el chat y los DM: el filtro de insultos y la moderación aplican también a estas cuentas; los textos son neutros.
4. `simulate` envía la posición del local a la geocerca. Es el mismo mecanismo de las pruebas con simuladores, pero hazlo solo en
   entornos de prueba.
5. **SQL pendiente (opcional):** `supabase/migrations/pending/215_test_users_flag.sql` añade `users.is_test` (solo `service_role` puede
   cambiarlo). Aplícalo antes de `seed` si quieres la doble marca.
6. Los scripts usan solo `@supabase/supabase-js` ya instalado en `web/node_modules`; no hay dependencias nuevas.
