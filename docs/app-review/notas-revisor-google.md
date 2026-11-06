# Instructions for Google Play review (Play Console → App content → "App access" and "Notes")

> **BORRADOR para revisión de Juan · 2026-11-06.** Mismo estado y mismas preguntas pendientes que `notas-revisor-apple.md` (sección "Pendiente de Juan"): tarjeta del local de demo, segunda cuenta para Match/ToD, subdominio del local, credenciales y PIN. Las credenciales las añade Juan desde su archivo local; no se guardan aquí.
> Texto pegable: desde `---` hasta el final de "Data safety".

---

**App access — all or part of the app is restricted.** Instructions:

JChat opens a venue's chat only when the phone is inside that venue (50 m radius; scanning the venue's QR code does not skip this check). To let you test without travelling we created a demo venue, **"JChat Demo Lounge"** (open 24 hours), and a demo account that owns it. The owner of a venue enters its chat from anywhere (a single server-side exception).

1. Sign in with username `jchatreview`, e-mail `<REVIEWER_EMAIL>`, password `<REVIEWER_PASSWORD>` (no 2-step verification, no SMS code).
2. Accept the terms and enter a date of birth that makes you 21 or older (for example 01/01/1990). Only the year is stored.
3. Open the **Nearby** tab, tap **JChat Demo Lounge** → **Enter chat**. Allow location "while using the app" if asked; it is used only to confirm presence, is never shown to other people, coordinates are not stored. The app never asks for background location.

**What you can test**
- Chat in the Main Room; long-press a message to **Report** or **Block**.
- **Menu** (four items) → add one → checkout. `<PAYMENT_NOTE>`
- **Direct messages** from any profile; ⋯ menu to report or block.
- **Settings → Work Mode** → JChat Demo Lounge → PIN `<POS_PIN>`: staff tools (tables, orders, checkout). Bluetooth/nearby-devices permissions are used only here, to connect a card reader; regular users are never asked.
- Match and Truth or Dare (18+, optional) are for customers present in a venue and are not available to the venue owner. `<GAMES_NOTE>`

**User-generated content (UGC policy).** Users can report and block from every place where people see other people's content (messages, direct messages, profiles, posts, comments, stories, Match profiles, Truth or Dare results). A person reviews reports within 24 hours (moderation queue); content is hidden and accounts suspended when needed. Chat, comments and direct messages pass a word filter; photos in direct messages and Match are scanned with Google Cloud Vision SafeSearch and explicit images are blocked. Contact: safety@jchat.cloud, https://jchat.cloud/support, and **Settings → Contact us**.

**Account deletion.** In the app: **Settings → Delete account** (immediate; profile, photos and messages are removed). On the web: https://jchat.cloud/account/delete (use this URL in the Data safety form). Venue owners close or transfer the venue first.

**Payments policy.** Everything paid in the app is **physical food and drink consumed at the venue** (orders, tips, and a drink or dish given to another person who is there). No digital goods, subscriptions or app features are sold in the app, so Google Play Billing is not used; payments are processed by Stripe.

**Alcohol.** Some venues list alcohol. Nothing is shipped or delivered: staff serve it at the venue and check ID. Items marked 21+ show a notice before payment. The app is for adults (18+).

**Permissions.** Location (while in use; venue presence), camera/photos/microphone (profile and chat photos, voice notes), notifications, biometrics (optional app lock). Bluetooth/nearby devices only in Work Mode for card readers and printers. No background location, no advertising ID.

**Data safety.** Answers match the App Privacy labels on iOS (`google-data-safety.md`).
