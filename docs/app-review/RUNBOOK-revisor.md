# Kit del revisor — pasos para Juan Carlos (en orden)

Todo lo que se prepara aquí está **sin aplicar**. Nada toca producción hasta que tú lo ejecutes.

## A. Antes de enviar a revisión

1. **Cuenta del revisor.** Crea una cuenta normal desde la app (correo + contraseña propios, por ejemplo `appreview@…` que tú controles). Copia su `user_id` (Supabase → Authentication → Users). No guardes la contraseña en el repositorio.
2. **Cuenta de pagos de PRUEBA para el local.** En el panel de Stripe en modo test crea (o usa) una cuenta Connect de prueba y copia su `acct_…`. Sin ella, los pedidos con tarjeta del local de demo no funcionan.
3. **Ejecuta el seed** (`supabase/scripts/demo_venue_seed.sql`) por MCP **después de revisarlo**:
   - sustituye `:reviewer_user_id` por el `user_id` del paso 1 (entre comillas simples);
   - sustituye `:stripe_test_account_id` por el `acct_…` del paso 2 (o déjalo como está si aún no lo tienes);
   - el seed es idempotente y **renueva los 14 días de presencia**: vuelve a ejecutarlo la víspera del envío y si la revisión se alarga más de 14 días.
4. **Confirma la edad de la cuenta del revisor** entrando una vez con ella (el aviso pide la fecha de nacimiento) y acepta los términos.
5. **Prueba tú mismo con esa cuenta** (iPhone y Android, con el build de producción/TestFlight): abrir `https://jchat-demo.jchat.cloud`, entrar al chat, ver los 8 mensajes, pedir con la tarjeta 4242, regalar a "Alex D.", abrir Match y Verdad o Reto, reportar y bloquear, borrar una cuenta de prueba (no la del revisor).
6. Pega `notas-revisor-apple.md` / `notas-revisor-google.md` (rellena correo y contraseña) en las consolas. El correo de soporte que aparece es `safety@jchat.cloud`.
7. App Store Connect → App Privacy y Play Console → Data safety: copia las tablas de `docs/store-listing/app-privacy-labels.md` y `google-data-safety.md`.

## B. Lo que no he podido comprobar en pantalla (verifica en el dispositivo)

Las notas afirman rutas de la interfaz que leí en el código, pero **no ejecuté la app**:
- que "JChat Demo" salga en la pestaña **Cercanos** (si no, el enlace `https://jchat-demo.jchat.cloud` es la vía principal);
- **+ → Games** para Match y Verdad o Reto, y que ambos muestren cartas/perfiles con las 4 personas de demo (el seed activa los juegos y da presencia a todos; el mazo de Match puede salir vacío si exige fotos aprobadas, que el seed no crea);
- **Ajustes → Privacidad → Usuarios bloqueados** y los botones de reportar/bloquear de las historias (están en la rama `fix/store-blockers`, que debe estar fusionada y en el build);
- que el pedido con tarjeta de prueba funciona con la cuenta Stripe del paso 2.

## C. Después de la revisión

- Ejecuta `supabase/scripts/demo_venue_teardown.sql` si no quieres dejar el local de demo (no toca la cuenta del revisor; devuélvele el plan a mano si hace falta).
- Si Apple/Google piden otra pasada, vuelve a ejecutar el seed (renueva la presencia).

## D. Seguridad del kit

- El local de demo tiene presencia "falsa" de 14 días solo para el revisor y las 4 personas ficticias (`users.is_test = true`). No hay datos de personas reales. Los correos de las personas son `@jchat-demo.invalid` y no tienen contraseña.
- El seed cambia el plan del revisor a `business` (necesario para ser dueña de un local). No cambia nada más de su cuenta.
