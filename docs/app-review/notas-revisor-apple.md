# Notes for Review — Apple App Store (paste into "App Review Information → Notes")

> Owner checklist before submitting (Spanish, not for Apple): see `docs/app-review/RUNBOOK-revisor.md`. Replace `<REVIEWER_EMAIL>` and `<REVIEWER_PASSWORD>` with the real demo account. Do not commit the real password.
> Text below is meant to be pasted as is (English). Length: under the 4,000-character limit of the field.

---

**What JChat is.** JChat is a social app for people who are in the same bar, restaurant or café. When you arrive at a venue that uses JChat you join that venue's chat, see its menu, order from your table, send a drink to someone who is there, and (optionally) play Match or Truth or Dare with the people present. The venue's chat only opens when the phone is inside the venue, which is why we created a demo venue and a demo account for review.

**Demo account (no 2-step verification)**
- E-mail: `<REVIEWER_EMAIL>`
- Password: `<REVIEWER_PASSWORD>`
- On first sign-in the app asks you to accept the terms and to confirm your date of birth (we only keep the year). Enter any date that makes you 21 or older, for example 01/01/1990.
- This account OWNS the demo venue **"JChat Demo"** (Cupertino). Venue owners can enter their own venue's chat without being physically there, so you can test everything from anywhere. Location permission ("while using the app") is used only to confirm that a person is inside a venue; it is never shown to other people.

**How to open the demo venue**
- Open this link on the device: `https://jchat-demo.jchat.cloud` (it opens JChat on the venue), or open the **Nearby** tab and tap "JChat Demo".
- Tap **Enter chat**. Four fictional people ("demo people") are already in the room.

**What to test**
1. *Chat:* send a message in the Main Room. Long-press another person's message to **Report** or **Block** them.
2. *Order:* open the venue **Menu**, add items, go to checkout and pay with the Stripe **test** card `4242 4242 4242 4242`, any future expiry, any CVC and ZIP. The build is connected to Stripe in TEST mode: nothing is charged. Two products (beer, wine) show "Only for ages 21 and over. You will be asked for ID at the venue."
3. *Gift:* tap one of the demo people in the chat → **Gift** → choose a product → pay with the same test card. The card is only held; it is charged only if the recipient accepts, and the demo people never do, so it expires.
4. *Match and Truth or Dare:* in the chat tap **+** → **Games**. Match needs the confirmed age (above). Both are optional and can be turned off in Settings.
5. *Direct messages and profiles:* open any profile → **Message**. In the profile menu (⋯) you can **Report** or **Block**.

**Where the safety features are (Guideline 1.2)**
- Report: long-press a message (rooms and direct messages), or the ⋯ menu of a profile, a post, a comment, a story or a Truth or Dare result. Reports go to our moderation queue and are reviewed by a person within 24 hours; we hide content and suspend accounts when needed.
- Block: same menus, and **Settings → Privacy & Security → Blocked users**. Blocking removes the person's content from your view and stops contact both ways.
- Automatic filtering: photos sent in direct messages and Match are scanned before they are shown (explicit images are blocked); messages pass a word filter.
- Contact: **Settings → Contact us**, https://jchat.cloud/support and safety@jchat.cloud.
- **Delete account (Guideline 5.1.1(v)):** Settings → Delete Account. It removes the account and personal data inside the app, no website needed.

**Payments (Guidelines 3.1.1 / 3.1.3(e))**
JChat sells no digital content, subscriptions or app features. Everything paid in the app is **physical food and drink consumed at the venue** (orders, tips and gifts of a drink or dish for another person who is there). Per guideline 3.1.3(e) (goods and services consumed outside the app) these use Stripe and Apple Pay instead of in-app purchase. A gift is a physical item given to another person at the venue (3.2.1(vii) also allows gifts between individuals).

**Alcohol (Guideline 1.4.3)**
Some venues serve alcohol. The app does not deliver or ship anything: orders are served at the venue by staff, who check ID. Products marked 21+ show the notice above before payment. JChat is rated 18+.

**Sign in with Apple (4.8)** is offered next to Google and e-mail sign-in. **Permissions:** location while using the app (venue presence), camera/photos/microphone (profile photos, chat photos, voice messages), notifications. Bluetooth/local network are used only by venue staff to connect card readers and are never requested from regular users.

Thank you for reviewing JChat. If anything is unclear, write to safety@jchat.cloud.
