# Notes for Review — Apple App Store (paste into "App Review Information → Notes")

> **BORRADOR para revisión de Juan · 2026-11-06.** Estado real de hoy (Fases A, B y C hechas; local de demo **JChat Demo Lounge** de producción, leído en solo lectura el 2026-11-06).
> Antes de pegar, lee `## Pendiente de Juan` al final: hay 5 cosas que el texto da por hechas y todavía no lo están. Texto pegable en inglés: la línea `---` hasta `Thank you…`. Límite del campo: 4.000 caracteres (este texto ronda los 3.900; revisa el recuento tras rellenar los marcadores).
> Las credenciales NO están aquí: el correo y la contraseña de @jchatreview, y el PIN del Modo Trabajo, "los añade Juan" desde su archivo local al pegar en la consola.

---

**What JChat is.** JChat is a social app for adults (18+) who are in the same bar, restaurant or café. When you are at a venue that uses JChat you join its chat, see its menu, order from your table and (optionally) play Match or Truth or Dare with the people who are there. The chat only opens when the phone is inside the venue, so we prepared a demo venue and a demo account for review.

**Review mode.** A venue's chat opens only when the phone is physically inside it. To let you test without travelling, we turned on a **review mode** (it expires by itself, 30 days at most): the two accounts below can see and enter the demo venue **"JChat Demo Lounge"** (Florida) from anywhere, even with location off. The server controls it, it applies only to those accounts and that venue, every use is logged, and the venue is invisible to every other user. For everyone else the app still requires physical presence. With account 2, open **Map** or **Nearby** → **JChat Demo Lounge** → **Enter chat**.

**Demo accounts (no 2-step verification, no SMS)**
- On first sign-in accept the terms and enter a date of birth that makes you 21+ (e.g. 01/01/1990; only the year is kept).
- **Account 1 – venue owner** `jchatreview`: `<REVIEWER_EMAIL>` / `<REVIEWER_PASSWORD>`. Owns the demo venue. Business side: web dashboard https://jchat.cloud/dashboard and **Settings → Work Mode** → JChat Demo Lounge → PIN `<POS_PIN>` (staff tools; card readers use Bluetooth only here).
- **Account 2 – customer** `jchatreview2`: `<REVIEWER2_EMAIL>` / `<REVIEWER2_PASSWORD>`. A normal customer: use it for everything below.

**What to test with account 2**
1. *Chat:* four demo people are present and three messages are in the Main Room. Send one; long-press a message to **Report** or **Block**.
2. *Match and Truth or Dare:* **+ → Games** → Match (the four demo people appear in the deck) and Truth or Dare (start a round; the card catalog is built in).
3. *Menu and order:* open **Menu** (six items), add one and go to checkout; two demo offers are in **Offers**. `<PAYMENT_NOTE>`
4. *Direct messages and profiles:* open any profile → **Message**; the ⋯ menu has **Report** and **Block**.
5. *Delete account:* **Settings → Delete account** (immediate and permanent: use it last).

**User-generated content (Guideline 1.2)**
- Report: long-press a message, or the ⋯ menu of a profile, post, comment, story, direct message, Match profile or Truth or Dare result. A person reviews reports within 24 hours; content is hidden and accounts suspended when needed.
- Block: same menus and **Settings → Privacy → Blocked users**; blocking removes contact both ways.
- Filters: a word filter on chat, comments and DMs; photos in DMs and Match are scanned (SafeSearch) before they are shown, and Match photos are also reviewed.
- Contact: **Settings → Contact us**, https://jchat.cloud/support, safety@jchat.cloud.

**Account deletion (5.1.1(v)).** **Settings → Delete account** inside the app removes the account and personal data at once (profile, photos, messages). Also at https://jchat.cloud/account/delete. Venue-owner accounts must close the venue first.

**Payments (3.1.1 / 3.1.3(e)).** JChat sells no digital content, subscriptions or app features. Everything paid is **physical food and drink consumed at the venue** (orders, tips, a drink given to someone present), paid through Stripe and Apple Pay, not in-app purchase.

**Alcohol (1.4.3) and age.** Some venues list alcohol. Nothing is shipped; staff serve it at the venue and check ID. 21+ items show a notice before payment. The app is 18+.

**Other.** Sign in with Apple is offered with Google and e-mail (4.8). Permissions: location while using the app, camera/photos/microphone, notifications; Face ID optional. Bluetooth only for the staff card reader. No tracking, no ad identifier.

Thank you for reviewing JChat. Questions: soporte@jchat.cloud (safety reports: safety@jchat.cloud).

---

## Pendiente de Juan (no pegar)

1. **Orden:** (a) aplicar 262 (hecho), (b) crear `@jchatreview2` (hecho), (c) subir los 4 avatares de `supabase/scripts/review-seed-avatars/` al bucket `match-photos` (`demo/review-seed/demo-1..4.png`), (d) ejecutar `supabase/scripts/review_seed.sql` por MCP, (e) en `/super-admin/review-mode` pulsar "Activar 30 días" **la víspera del envío** (caduca solo; si la revisión se alarga, vuelve a pulsarlo), (f) entrar con `@jchatreview2` desde fuera de Florida y recorrer los 5 puntos de "What to test".
2. **Tarjeta (`<PAYMENT_NOTE>`).** Texto propuesto: *"You can go through the order up to Stripe's payment sheet; with the test keys currently in use it accepts the test card 4242 4242 4242 4242 (any future date, any CVC/ZIP). Nothing is charged."* **Dos condiciones antes de pegarlo:** el local JChat Demo Lounge **no tiene `stripe_account_id`** (leído en producción 2026-11-06), así que hoy la hoja de pago NO se abre; y desde el repo no puedo comprobar que el build de producción use claves de **prueba**. Si pasas a modo real antes del envío, propuesta (solo propuesta): un cupón del 100 % limitado a los locales del grupo de prueba, para que el revisor complete el pedido sin pagar.
3. **`<REVIEWER_EMAIL>` / `<REVIEWER_PASSWORD>` / `<REVIEWER2_EMAIL>` / `<REVIEWER2_PASSWORD>` / `<POS_PIN>`:** los añades tú desde tu archivo local al pegar. **Límite de 4.000 caracteres:** el texto pegable mide ≈ 3.830 antes de sustituir los marcadores; cuenta de nuevo después. Comprueba que el PIN abre Modo Trabajo con `@jchatreview`.
4. **Modo Trabajo y dashboard** son de la cuenta 1 (dueña); confirma entrando una vez que el dashboard web abre con las mismas credenciales.
5. **Verdad o Reto:** el seed no crea cartas (el catálogo global ya tiene 1.000 en inglés); la cuenta 2 acepta los términos del juego la primera vez y abre una ronda. Comprobar en el dispositivo.
6. **Match:** la cuenta 2 se une a Match como cualquier cliente; el seed solo le pone género `nonbinary` y busca `all` si no tenía perfil. Comprobar que el mazo muestra a las 4 personas.
7. **Borrado de cuenta del dueño:** hoy `@jchatreview` recibiría 409 si intentara borrarse (se arregla en D4). Las notas mandan a borrar solo con la cuenta 2.
8. **Cuentas QA (`@test`, `@test1`, `@test002`):** quedan en el grupo, así que ven el Demo Lounge mientras el interruptor esté encendido. Apaga el interruptor al terminar la revisión.
