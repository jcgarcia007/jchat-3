# Instructions for Google Play review (Play Console → App content → "App access" and "Notes")

> **BORRADOR para revisión de Juan · 2026-11-06.** Mismo estado, flujo (modo revisión, cuenta 1 dueña / cuenta 2 cliente) y mismas preguntas pendientes que `notas-revisor-apple.md` (sección "Pendiente de Juan"): tarjeta del local de demo, segunda cuenta para Match/ToD, subdominio del local, credenciales y PIN. Las credenciales las añade Juan desde su archivo local; no se guardan aquí.
> Texto pegable: desde `---` hasta el final de "Data safety".

---

**App access — all or part of the app is restricted.** Instructions:

JChat opens a venue's chat only when the phone is physically inside it. So that you can test without travelling, we turned on a **review mode**: while it is on (it expires by itself, 30 days at most), the two accounts below can see and enter the demo venue **"JChat Demo Lounge"** from anywhere, even with location turned off. The server controls it: it applies only to those accounts and that venue, every use is logged, and the venue is not visible to any other user. For everyone else and every other venue the app still requires physical presence.

1. **Account 1 – venue owner** `jchatreview`: e-mail `<REVIEWER_EMAIL>`, password `<REVIEWER_PASSWORD>`. Business side: web dashboard https://jchat.cloud/dashboard (same credentials) and **Settings → Work Mode** → JChat Demo Lounge → PIN `<POS_PIN>`.
2. **Account 2 – customer** `jchatreview2`: e-mail `<REVIEWER2_EMAIL>`, password `<REVIEWER2_PASSWORD>`. A normal customer; use it for everything below.
3. Both accounts: no 2-step verification, no SMS code. On first sign-in accept the terms and enter a date of birth that makes you 21 or older (for example 01/01/1990); only the year is stored.
4. With account 2 open the **Map** or **Nearby** tab, tap **JChat Demo Lounge** (listed even if you are far away) → **Enter chat**. Location "while using the app" is optional here; when allowed it is used only to confirm presence, is never shown to other people and coordinates are not stored.

**What you can test (account 2)**
- Chat in the Main Room (four demo people present, three messages); long-press a message to **Report** or **Block**.
- **+ → Games**: Match (the four demo people appear) and Truth or Dare (18+, optional).
- **Menu** (six items) → add one → checkout; two demo offers in **Offers**. `<PAYMENT_NOTE>`
- **Direct messages** from any profile; ⋯ menu to report or block.
- **Settings → Delete account** (immediate and permanent: use it last).

**User-generated content (UGC policy).** Users can report and block from every place where people see other people's content (messages, direct messages, profiles, posts, comments, stories, Match profiles, Truth or Dare results). A person reviews reports within 24 hours (moderation queue); content is hidden and accounts suspended when needed. Chat, comments and direct messages pass a word filter; photos in direct messages and Match are scanned with Google Cloud Vision SafeSearch and explicit images are blocked. Contact: safety@jchat.cloud, https://jchat.cloud/support, and **Settings → Contact us**.

**Account deletion.** In the app: **Settings → Delete account** (immediate; profile, photos and messages are removed). On the web: https://jchat.cloud/account/delete (use this URL in the Data safety form). Venue owners close or transfer the venue first.

**Payments policy.** Everything paid in the app is **physical food and drink consumed at the venue** (orders, tips, and a drink or dish given to another person who is there). No digital goods, subscriptions or app features are sold in the app, so Google Play Billing is not used; payments are processed by Stripe.

**Alcohol.** Some venues list alcohol. Nothing is shipped or delivered: staff serve it at the venue and check ID. Items marked 21+ show a notice before payment. The app is for adults (18+).

**Permissions.** Location (while in use; venue presence), camera/photos/microphone (profile and chat photos, voice notes), notifications, biometrics (optional app lock). Bluetooth/nearby devices only in Work Mode for card readers and printers. No background location, no advertising ID.

**Data safety.** Answers match the App Privacy labels on iOS (`google-data-safety.md`).
