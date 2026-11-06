# Notes for Review — Apple App Store (paste into "App Review Information → Notes")

> **BORRADOR para revisión de Juan · 2026-11-06.** Estado real de hoy (Fases A, B y C hechas; local de demo **JChat Demo Lounge** de producción, leído en solo lectura el 2026-11-06).
> Antes de pegar, lee `## Pendiente de Juan` al final: hay 5 cosas que el texto da por hechas y todavía no lo están. Texto pegable en inglés: la línea `---` hasta `Thank you…`. Límite del campo: 4.000 caracteres (este texto ronda los 3.700).
> Las credenciales NO están aquí: el correo y la contraseña de @jchatreview, y el PIN del Modo Trabajo, "los añade Juan" desde su archivo local al pegar en la consola.

---

**What JChat is.** JChat is a social app for adults (18+) who are in the same bar, restaurant or café. When you are at a venue that uses JChat you join its chat, see its menu, order from your table and (optionally) play Match or Truth or Dare with the people who are there. The chat only opens when the phone is inside the venue, so we prepared a demo venue and a demo account for review.

**Demo account (no 2-step verification, no SMS)**
- Username: `jchatreview`
- E-mail / password: `<REVIEWER_EMAIL>` / `<REVIEWER_PASSWORD>` (added by Juan in the console)
- On first sign-in the app asks to accept the terms and to confirm the date of birth (only the year is kept). Use any date that makes you 21 or older, for example 01/01/1990.
- This account **owns** the demo venue **"JChat Demo Lounge"** (open 24 hours). Owners enter their own venue's chat from anywhere, without being physically there (the server makes this single exception for the owner of that venue). Everyone else must be inside the venue's 50 m radius: scanning the venue's QR code does not skip the location check. Location "while using the app" is used only to confirm presence; it is never shown to other people and coordinates are not stored.

**How to open the demo venue**
Open the **Nearby** tab (or the map) and tap **JChat Demo Lounge** → **Enter chat** (choose how to appear, then confirm).

**What to test**
1. *Chat:* send a message in the Main Room. Long-press a message to **Report** or **Block**.
2. *Menu and order:* open the venue **Menu** (four items), add one and go to checkout. `<PAYMENT_NOTE>`
3. *Direct messages and profiles:* open any profile → **Message**; the ⋯ menu has **Report** and **Block**.
4. *Work Mode (venue staff tools):* **Settings → Work Mode** → choose JChat Demo Lounge → enter the PIN `<POS_PIN>`. It shows tables, orders and checkout for staff. Card readers (Stripe Terminal) use Bluetooth only here; regular users are never asked for Bluetooth.
5. *Match and Truth or Dare:* they are for customers present in a venue and are **not available to the venue owner**, so with this account they do not open. `<GAMES_NOTE>`

**User-generated content (Guideline 1.2)**
- Report: long-press a message, or the ⋯ menu of a profile, post, comment, story, direct message, Match profile or Truth or Dare result. A person reviews reports in the moderation queue (`/super-admin/alerts`) within 24 hours; content is hidden and accounts suspended when needed. Child-safety reports are the first reason in the list.
- Block: same menus and **Settings → Privacy → Blocked users**; blocking removes contact both ways.
- Filters: chat, comments and direct messages pass a word filter; photos in direct messages and Match are scanned with Google Cloud Vision SafeSearch before they are shown (explicit images are blocked). Match photos are also reviewed.
- Contact: **Settings → Contact us**, https://jchat.cloud/support, safety@jchat.cloud.

**Account deletion (5.1.1(v)).** **Settings → Delete account** inside the app removes the account and personal data at once (profile, photos, messages). Also at https://jchat.cloud/account/delete (explanation; deleting requires signing in). Venue-owner accounts must close or transfer the venue first.

**Payments (3.1.1 / 3.1.3(e)).** JChat sells no digital content, subscriptions or app features. Everything paid is **physical food and drink consumed at the venue** (orders, tips, a drink or dish given to another person who is there), processed by Stripe and Apple Pay, not in-app purchase.

**Alcohol (1.4.3) and age.** Some venues list alcohol. Nothing is shipped or delivered; staff serve it at the venue and check ID. Items marked 21+ show a notice before payment. The app is 18+; the age is self-declared and confirmed on the server.

**Other.** Sign in with Apple is offered with Google and e-mail (4.8). Permissions: location while using the app, camera/photos/microphone (profile and chat photos, voice notes), notifications; Face ID is optional (app lock). Bluetooth-central is declared only for the staff card reader. No tracking, no ad identifier.

Thank you for reviewing JChat. Questions: soporte@jchat.cloud (safety reports: safety@jchat.cloud).

---

## Pendiente de Juan (no pegar)

1. **Pagos con tarjeta.** El local de producción JChat Demo Lounge **no tiene cuenta Stripe Connect** (`stripe_account_id` vacío, cobros desactivados), así que el revisor no podrá pagar con tarjeta. ¿Conectas una cuenta Connect (modo de la app) al local, o quieres que el pedido de demo se pueda pagar "en el local"? Cuando lo sepas, sustituye `<PAYMENT_NOTE>`. **No afirmes "Stripe en modo de prueba / tarjeta 4242"** salvo que el build de producción use claves de prueba (no lo puedo comprobar desde el repo).
2. **Match y Verdad o Reto con la cuenta del revisor.** El dueño no puede jugar (lo confirma el código y la auditoría). Para que Apple/Google los vean hace falta **una segunda cuenta de demo no-dueña** que pueda estar "presente": o bien (a) un local/radio de demo que no exija GPS, o (b) una cuenta de demo con presencia sembrada (el seed `demo_venue_seed.sql` crea 4 personas ficticias con presencia de 14 días). Propuesta: (b) con una cuenta `jchatreview2`, más una línea en las notas. Hasta entonces `<GAMES_NOTE>` = "Screenshots of both are attached to this submission" (usar capturas en App Store Connect).
3. **Enlace `https://jchat-demo.jchat.cloud`.** Las notas anteriores lo usaban; el local real **no tiene subdominio** (`jchat-demo-lounge-y7of` es su slug; sin subdominio no hay enlace de app). Las notas ya no lo mencionan. Si quieres el enlace universal, asigna el subdominio `jchat-demo` al local.
4. **Local de demo en Florida (Davie).** Si el revisor no está allí, solo entra el dueño. Es lo que dicen las notas. Si prefieres que Apple vea el chat como cliente, mismo punto 2.
5. **Credenciales y PIN.** Pega el correo, la contraseña y el PIN desde tu archivo local; comprueba antes que el PIN abre Modo Trabajo con @jchatreview.
