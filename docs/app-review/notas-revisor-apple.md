# Notes for Review — Apple App Store (paste into "App Review Information → Notes")

> **BORRADOR para revisión de Juan · 2026-11-06.** Estado real de hoy (Fases A, B y C hechas; local de demo **JChat Demo Lounge** de producción, leído en solo lectura el 2026-11-06).
> Antes de pegar, lee `## Pendiente de Juan` al final: hay 5 cosas que el texto da por hechas y todavía no lo están. Texto pegable en inglés: la línea `---` hasta `Thank you…`. Límite del campo: 4.000 caracteres (con marcadores mide 3.616; con credenciales y la variante (i) de pagos queda ≈ 3.900: cuenta de nuevo al pegar).
> Las credenciales NO están aquí: el correo y la contraseña de @jchatreview, y el PIN del Modo Trabajo, "los añade Juan" desde su archivo local al pegar en la consola.

---

**What JChat is.** JChat is a social app for adults (18+) in the same bar, restaurant or café: join the venue's chat, see its menu, order from your table and (optionally) play Match or Truth or Dare with the people there.

**Review mode.** A venue's chat opens only when the phone is inside it. So you can test without travelling, we turned on a **review mode** (expires by itself, 30 days at most): the two accounts below can see and enter the demo venue **"JChat Demo Lounge"** (Florida) from anywhere, even with location off. It is controlled by the server, applies only to those accounts and that venue, is logged, and the venue is invisible to everyone else, who still need physical presence.

**Demo accounts (no 2-step verification, no SMS)**
- On first sign-in accept the terms and enter a date of birth that makes you 21+ (e.g. 01/01/1990; only the year is kept).
- **Account 1 – venue owner** `jchatreview`: `<REVIEWER_EMAIL>` / `<REVIEWER_PASSWORD>`. Owns the demo venue; business side: web dashboard https://jchat.cloud/dashboard and **Settings → Work Mode** → JChat Demo Lounge → PIN `<POS_PIN>`.
- **Account 2 – customer** `jchatreview2`: `<REVIEWER2_EMAIL>` / `<REVIEWER2_PASSWORD>`. A normal customer: use it for everything below.

**What to test with account 2**
1. *Chat (first, before ordering):* **Map**/**Nearby** → JChat Demo Lounge → **Enter chat**. Three messages; send one; long-press a message to **Report** or **Block**. The chat's "people here" counts only people with the app open now; the four demo people show in the map counter and in Match.
2. *Games:* **+ → Games**. Match: account 2's profile is complete, the deck opens directly. Truth or Dare: pick a category to publish a card (only test accounts see it).
3. *Menu and order:* after entering the chat, open **Menu** (six items), add one and go to checkout; two demo offers are in **Offers**. `<PAGOS>`
4. *Direct messages and profiles:* open any profile → **Message**; the ⋯ menu has **Report** and **Block**.
5. *Delete account:* **Settings → Delete account** (permanent: use it last).

**User-generated content (Guideline 1.2)**
- Report: long-press a message, or the ⋯ menu of a profile, post, comment, story, direct message, Match profile or Truth or Dare result. A person reviews reports within 24 hours; content is hidden and accounts suspended when needed.
- Block: same menus and **Settings → Privacy → Blocked users**; blocking removes contact both ways.
- Filters: word filter on chat, comments and DMs; photos in DMs and Match are scanned (SafeSearch) and Match photos are reviewed.
- Contact: **Settings → Contact us**, https://jchat.cloud/support, safety@jchat.cloud.

**Account deletion (5.1.1(v)).** **Settings → Delete account** inside the app removes the account and personal data at once (profile, photos, messages). Also at https://jchat.cloud/account/delete. Venue owners can delete too (the venue closes).

**Payments (3.1.1 / 3.1.3(e)).** JChat sells no digital content, subscriptions or app features. Everything paid is **physical food and drink consumed at the venue** (orders, tips, a drink for someone present), paid via Stripe and Apple Pay.

**Alcohol (1.4.3) and age.** Some venues list alcohol. Nothing is shipped; staff serve it at the venue and check ID. 21+ items show a notice before payment. The app is 18+.

**Other.** Sign in with Apple is offered with Google and e-mail (4.8). Permissions: location while using the app, camera/photos/microphone, notifications; Face ID optional. No tracking, no ad identifier.

Thank you. Questions: soporte@jchat.cloud (safety: safety@jchat.cloud).

---

## Pendiente de Juan (no pegar)

1. **Orden:** (a) aplicar 262 (hecho), (b) crear `@jchatreview2` (hecho), (c) subir los 5 avatares de `supabase/scripts/review-seed-avatars/` al bucket privado `match-photos`, ruta `demo/review-seed/` (`demo-1.png`, `demo-2.png`, `demo-3.png`, `demo-4.png`, `demo-reviewer.png`), (d) ejecutar `supabase/scripts/review_seed.sql` por MCP, (e) en `/super-admin/review-mode` pulsar "Activar 30 días" **la víspera del envío** (caduca solo; si la revisión se alarga, vuelve a pulsarlo), (f) entrar con `@jchatreview2` desde fuera de Florida y recorrer los 5 puntos de "What to test".
2. **Pagos (`<PAGOS>`).** Sustituye el marcador por UNA de estas dos variantes (en inglés, pegables):
   - **(i) Con Stripe Connect en modo prueba conectado al Demo Lounge:** *"Checkout opens Stripe's payment sheet in test mode: use card 4242 4242 4242 4242, any future expiry date and any CVC/ZIP. Nothing is charged."* Condición: el local tiene `stripe_account_id` y `stripe_charges_enabled`, y el build de producción usa claves de prueba (no verificable desde el repo).
   - **(ii) Sin Connect:** *"The order reaches the payment screen; this demo venue does not charge in the app, and the screen says so."* (Con el cambio B de D2 la app muestra "Este local todavía no acepta pagos en la app. Puedes pedir en el mostrador." con Pagar desactivado; requiere OTA + desplegar `payments`.)
   Si usas (i) no pegues (ii) y al revés. Las siluetas de las personas demo: `<si Juan subió las siluetas>` las fotos del mazo se ven; si no, las tarjetas salen sin foto (las notas no las mencionan).
3. **`<REVIEWER_EMAIL>` / `<REVIEWER_PASSWORD>` / `<REVIEWER2_EMAIL>` / `<REVIEWER2_PASSWORD>` / `<POS_PIN>`:** los añades tú desde tu archivo local al pegar. **Límite de 4.000 caracteres:** el texto pegable mide 3.616 con los marcadores, ≈ 3.900 ya rellenado; cuenta de nuevo después. Comprueba que el PIN abre Modo Trabajo con `@jchatreview`.
4. **Modo Trabajo y dashboard** son de la cuenta 1 (dueña); confirma entrando una vez que el dashboard web abre con las mismas credenciales.
5. **Verdad o Reto:** el seed no crea cartas (catálogo global de 1.000). En la app solo existe "elegir categoría → publicar una carta" (no se puede robar sin publicar); lo publicado lo ven solo las cuentas del grupo. Verificado en Android 2026-11-06.
6. **Match:** el seed (o `review_seed_reviewer2.sql` solo) deja completo el perfil de Match de la cuenta 2: género/busca si faltaban, foto aprobada `demo-reviewer.png` (id …0699) y 2 intereses. Sube antes el archivo `demo-reviewer.png`. Comprobar que el mazo abre directo y muestra a las 4 personas.
7. **Borrado de cuenta del dueño (D4):** el dueño puede borrar su cuenta desde la app y la web: sus locales se CIERRAN (no se reabren) y se conservan pedidos y pagos sin datos personales. **No uses `@jchatreview` (dueña de Demo Lounge) para probar el borrado**: cerraría el local de demo. Las notas mandan a borrar solo con la cuenta 2 (`@jchatreview2`).
8. **Cuentas QA (`@test`, `@test1`, `@test002`):** quedan en el grupo, así que ven el Demo Lounge mientras el interruptor esté encendido. Apaga el interruptor al terminar la revisión.
