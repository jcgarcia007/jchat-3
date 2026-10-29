# Instructions for Google Play review (Play Console → App content → "App access" and "Notes")

> Owner checklist before submitting (Spanish, not for Google): see `docs/app-review/RUNBOOK-revisor.md`. Replace `<REVIEWER_EMAIL>` and `<REVIEWER_PASSWORD>`; do not commit the real password.
> Text below is meant to be pasted as is (English).

---

**App access — all or part of the app is restricted.** Instructions:

JChat opens a venue's chat only when the phone is physically inside that venue. To let you test without travelling we created a demo venue, **"JChat Demo"** (Cupertino, CA), and a demo account that owns it. Venue owners can enter their own venue's chat from anywhere.

1. Sign in with e-mail `<REVIEWER_EMAIL>` and password `<REVIEWER_PASSWORD>` (no 2-step verification, no SMS code).
2. Accept the terms and enter a date of birth that makes you 21 or older (for example 01/01/1990). Only the year is stored.
3. Open `https://jchat-demo.jchat.cloud` on the device (Android App Link) or tap **JChat Demo** in the **Nearby** tab, then tap **Enter chat**.
4. Allow location "while using the app" when asked. It is used only to confirm presence in a venue and is never shown to other people. The app never asks for background location.

**What you can test**
- Chat in the Main Room; long-press another person's message to **Report** or **Block**.
- **Menu** → add items → checkout with the Stripe **test** card `4242 4242 4242 4242` (any future date, any CVC/ZIP). The build uses Stripe in TEST mode; nothing is charged. Google Pay appears when the device has a card in Google Pay (test mode).
- **Gift**: tap a demo person → Gift → pay with the test card (the card is only held; it is charged only if the recipient accepts).
- **+ → Games**: Match and Truth or Dare (18+, optional).
- **Direct messages** from any profile; ⋯ menu to report or block.

**User-generated content (UGC policy).** Users can report and block from every place where people see other people's content (messages, direct messages, profiles, posts, comments, stories, Truth or Dare results). Reports are reviewed by a human within 24 hours; content is hidden and accounts suspended when needed. Photos in direct messages and Match are scanned automatically and explicit images are blocked. Contact: safety@jchat.cloud, https://jchat.cloud/support, and **Settings → Contact us** in the app.

**Account deletion.** In the app: **Settings → Delete Account**. On the web: https://jchat.cloud/account (use this URL in the Data safety form's "account deletion" question).

**Payments policy.** Everything paid in the app is **physical food and drink consumed at the venue** (orders, tips, and a drink or dish given to another person who is there). No digital goods, subscriptions or app features are sold in the app, so Google Play Billing is not used; payments are processed by Stripe.

**Alcohol.** Some venues serve alcohol. Nothing is shipped or delivered: staff serve it at the venue and check ID. Products marked 21+ show "Only for ages 21 and over. You will be asked for ID at the venue." before payment. The app is for adults (18+).

**Permissions.** Location (while using the app, venue presence), camera/photos/microphone (profile and chat photos, voice messages), notifications. Bluetooth and nearby-devices permissions are used only by venue staff to connect card readers and are never requested from regular users.

**Data safety.** See the answers in `docs/app-review/google-data-safety.md` of the project; they match the App Privacy answers on iOS.
