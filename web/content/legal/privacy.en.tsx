/** Privacy Policy — English content. Public page: no var(--*), fixed hex only. */

const LINK: React.CSSProperties = { color: "var(--color-brand)", textDecoration: "underline" };
const H2: React.CSSProperties = { fontSize: "18px", fontWeight: 700, marginTop: "36px", marginBottom: "10px", color: "var(--gray-900)" };
const P: React.CSSProperties = { lineHeight: "1.7", marginTop: "0", marginBottom: "14px", color: "var(--gray-700)" };
const UL: React.CSSProperties = { paddingLeft: "20px", lineHeight: "1.7", color: "var(--gray-700)", marginBottom: "14px" };

export function PrivacyEN() {
  return (
    <>
      <h1 style={{ fontSize: "28px", fontWeight: 800, color: "var(--gray-900)", marginBottom: "6px", letterSpacing: "-0.5px" }}>
        Privacy Policy
      </h1>
      <p style={{ color: "var(--gray-500)", fontSize: "14px", marginTop: "0", marginBottom: "32px" }}>
        Last updated: November 7, 2026
      </p>

      <p style={P}>
        JChat is operated by <strong>Otunity Labs LLC</strong> ("Otunity Labs", "we", "us"), 6000 Palm Trace
        Landings Dr APT 312, Davie, FL 33314, United States. This policy explains what information we collect
        when you use the JChat mobile app, the JChat website (jchat.cloud), the business dashboard (including
        dashboard.tabpos.cloud) and related services (together, the "Service"), how we use it, and the choices
        you have.
      </p>

      {/* Table of contents */}
      <nav
        style={{
          background: "var(--gray-100)",
          borderRadius: "10px",
          padding: "20px 24px",
          marginBottom: "40px",
          fontSize: "14px",
        }}
      >
        <p style={{ fontWeight: 700, marginTop: 0, marginBottom: "10px", color: "var(--gray-900)" }}>Contents</p>
        <ol style={{ paddingLeft: "18px", margin: 0, lineHeight: "2" }}>
          <li><a href="#who-this-applies" style={LINK}>Who this applies to</a></li>
          <li><a href="#information-we-collect" style={LINK}>Information we collect</a></li>
          <li><a href="#how-we-use" style={LINK}>How we use information</a></li>
          <li><a href="#who-we-share" style={LINK}>Who we share information with</a></li>
          <li><a href="#your-content" style={LINK}>Your content and other users</a></li>
          <li><a href="#data-retention" style={LINK}>Data retention</a></li>
          <li><a href="#delete-account" style={LINK}>Deleting your account</a></li>
          <li><a href="#your-rights" style={LINK}>Your rights</a></li>
          <li><a href="#children" style={LINK}>Children</a></li>
          <li><a href="#security" style={LINK}>Security</a></li>
          <li><a href="#international" style={LINK}>International users</a></li>
          <li><a href="#tracking" style={LINK}>Tracking and advertising</a></li>
          <li><a href="#changes" style={LINK}>Changes</a></li>
          <li><a href="#contact" style={LINK}>Contact</a></li>
        </ol>
      </nav>

      <h2 id="who-this-applies" style={H2}>1. Who this applies to</h2>
      <p style={P}>
        JChat has three kinds of users: <strong>members</strong> (people who use the app to see nearby venues,
        chat and order), <strong>business owners and staff</strong> (who manage a venue through the dashboard
        and point-of-sale tools), and <strong>guests</strong> (people who order or pay at a venue by scanning
        a QR code without creating an account). This policy covers all of them.
      </p>

      <h2 id="information-we-collect" style={H2}>2. Information we collect</h2>
      <ul style={UL}>
        <li>
          <em>Account information:</em> email address, password (stored hashed by our authentication
          provider), name, username, profile photo, bio, language and app settings, and the <strong>year of
          birth</strong> you give us to confirm you are 18 or older (we keep only the year). If you sign in
          with Apple or Google, we receive the name and email those services share with us.
        </li>
        <li>
          <em>Match profile (optional):</em> if you use Match, your gender (woman, man or non-binary), who you
          want to meet (women, men or everyone), your interests and your photos. This is sensitive information:
          it is used only to show you people who fit and to show you to them. Your likes, matches and Match chats are
          erased when you leave the venue (except with people who follow each other).
        </li>
        <li>
          <em>Precise location, only while you use the app:</em> to show venues near you, to let you join a
          venue's or group's chat when you are within its radius, and to connect nearby card readers. We do
          not collect location in the background. We need your location to confirm that you are inside the
          venue. That way no one from outside gets into the chat. We do not store your exact location; we only
          confirm that you are here.
        </li>
        <li>
          <em>Content you create:</em> chat messages, direct messages, posts, photos, stories, reviews, voice
          notes and anything else you share. Photos require camera or photo-library permission; voice notes
          require microphone permission.
        </li>
        <li>
          <em>Orders and payments:</em> items ordered, amounts, tips and receipt codes.{" "}
          <strong>We never see or store your card number.</strong> Payments are processed by Stripe; we
          receive only a payment confirmation, the card brand and the last four digits.
        </li>
        <li>
          <em>Guest ordering:</em> if you order or pay at a venue by QR code without an account, we store a
          random device identifier, a hashed device fingerprint and a hashed IP address for security and fraud
          prevention (for example, to limit abusive orders). These are not linked to your name.
        </li>
        <li>
          <em>Business data:</em> if you are a business owner or employee, information about your business,
          menu, employees, tables, sales, inventory and your Stripe Connect account.
        </li>
        <li>
          <em>Device and diagnostic data:</em> device type, operating system, app version,
          push-notification token, crash and error logs (attached to your account ID only, never to your name,
          email or IP address).
        </li>
        <li>
          <em>Safety data:</em> reports you submit, users you block, moderation actions taken by venue owners,
          and CAPTCHA verification results.
        </li>
      </ul>

      <h2 id="how-we-use" style={H2}>3. How we use information</h2>
      <p style={P}>
        To provide the Service (maps, chat, ordering, payments, receipts, notifications); to keep the Service
        safe (fraud prevention, rate limiting, moderation, blocking abusive devices); to communicate with you
        about your account and orders; to improve the Service; and to comply with the law. We use location
        only for the features described above.
      </p>

      <h2 id="who-we-share" style={H2}>4. Who we share information with</h2>
      <p style={P}>
        We do not sell your personal information. We share it only with service providers who process it for
        us under contract, and only as needed:
      </p>
      {/* DRAFT FOR LEGAL REVIEW (A6, 2026-11): the provider list and the retention periods below are Juan's decisions and have NOT been reviewed by a lawyer. */}
      <ul style={UL}>
        <li><strong>Supabase</strong> — database, authentication and file storage, hosted in the United States.</li>
        <li><strong>Stripe</strong> — payment processing, business payouts and card readers. We never see or store your card number.</li>
        <li><strong>Google Cloud Vision</strong> — safety review of photos you send in Match and in direct messages: the bytes of the photo are sent to Google to detect content that breaks our rules.</li>
        <li><strong>Google Maps</strong> and <strong>Firebase Cloud Messaging</strong> (Google) — maps on Android and push notifications. <strong>Apple</strong> — push notifications and Apple Maps on iOS.</li>
        <li><strong>Expo</strong> — push notifications (the title and text of a notification pass through Expo&apos;s push service on their way to your phone) and app builds and updates.</li>
        <li><strong>Sentry</strong> — technical diagnostics (crash and error reports), linked only to your account ID, without your name, email or IP address.</li>
        <li><strong>hCaptcha</strong> — protection against bots when you sign in, sign up or recover a password.</li>
        <li><strong>Have I Been Pwned</strong> — when you create an account we check whether your password has appeared in a known data breach. Only the first 5 characters of the password&apos;s SHA-1 hash are sent (k-anonymity), together with your IP address as in any web request, and only when you sign up. Your password and the rest of the hash never leave your device.</li>
        <li><strong>Resend</strong> — sending account emails (sign-up confirmation, password recovery, receipts).</li>
        <li><strong>Vercel</strong> — website hosting.</li>
      </ul>
      <p style={P}>
        Venue owners who use the optional AI menu assistant send
        their own menu content to an AI provider (Anthropic / Claude); no member data is sent. When you order
        at a venue, the venue receives your order details (and, for reservations, the name and contact you
        provide). We may also disclose information if required by law or to protect the rights and safety of
        users and the Service.
      </p>

      <h2 id="your-content" style={H2}>5. Your content and other users</h2>
      <p style={P}>
        Messages you post in a venue or group chat are visible to other people in that chat. Your public
        profile (username, display name, photo, bio) is visible to other members. Venue owners can moderate
        their own chats (mute, remove, ban). You can report or block anyone from their profile.
      </p>

      <h2 id="data-retention" style={H2}>6. Data retention</h2>
      <p style={P}>
        We keep your information while your account is active. When you delete your account we delete{" "}
        <strong>right away</strong> your profile, photos, messages, Match profile and posts. Some records
        are kept after that, for these periods:
      </p>
      <ul style={UL}>
        <li><strong>Orders and payments:</strong> 7 years, without your personal data, for tax and accounting obligations.</li>
        <li><strong>Security logs:</strong> 90 days. The record of moderation actions and account suspensions: 1 year.</li>
        <li><strong>Closed reports</strong> (with the evidence attached to them): 1 year after they are resolved. Reports about child safety, or sent to the authorities (NCMEC): 2 years after they are resolved. Open reports are kept until they are resolved.</li>
        <li><strong>Moderation records</strong> of venue chats and games, and <strong>table reservation records</strong>: 1 year.</li>
        <li><strong>Photo-scan records</strong> and <strong>e-mail delivery records</strong>: 90 days (30 days for e-mails that were delivered).</li>
        <li><strong>Gifts</strong> you sent or received: kept without your identity.</li>
      </ul>
      <p style={P}>
        Guest ordering identifiers are kept for a limited period for security.
      </p>
      <p style={P}>
        When you delete your account, the reports you made or received stay <strong>without your identity</strong> until their
        term above ends. If your account was suspended for a confirmed violation, we keep an encrypted fingerprint of your e-mail
        address (not the address itself) for up to 2 years to prevent new accounts from being opened. To appeal, write to{" "}
        <a href="mailto:soporte@jchat.cloud" style={LINK}>soporte@jchat.cloud</a>.
      </p>

      <h2 id="delete-account" style={H2}>7. Deleting your account</h2>
      <p style={P}>
        You can permanently delete your account at any time in the app:{" "}
        <strong>Settings → Delete account</strong>, or on the web at{" "}
        <a href="/account/delete" style={LINK}>jchat.cloud/account/delete</a>. Deletion is immediate and irreversible. If you cannot
        access the app, email{" "}
        <a href="mailto:soporte@jchat.cloud" style={LINK}>soporte@jchat.cloud</a> from the address
        on your account and we will delete it.
      </p>
      <p style={P}>
        <strong>Venue owner accounts.</strong> You can delete your account yourself in the app (Settings → Delete account)
        or at jchat.cloud/account/delete. Your venue closes (it stops being visible and taking orders) and your personal
        data is deleted immediately. The venue&apos;s order, payment and receipt records are kept for up to 7 years, without
        your personal data, because accounting and tax rules require it. Your subscription is cancelled immediately, with no
        refund of the period already paid. If Stripe still holds a balance for you, it must reach your bank first.
      </p>

      <h2 id="your-rights" style={H2}>8. Your rights</h2>
      <p style={P}>
        Depending on where you live, you may have the right to access, correct, download or delete your
        personal information, and to object to or restrict certain processing. You can edit your profile and
        settings in the app, and contact us for anything else. We will not discriminate against you for
        exercising your rights.
      </p>

      <h2 id="children" style={H2}>9. Children</h2>
      <p style={P}>
        JChat is for adults. You must be <strong>18 or older</strong> to create an account. We do not
        knowingly collect information from anyone under 18; if you believe we have, contact us and we will
        delete it.
      </p>

      <h2 id="security" style={H2}>10. Security</h2>
      <p style={P}>
        Data is encrypted in transit (HTTPS/TLS). Access to personal data is restricted, and sensitive
        operations (payments, account deletion, moderation) run on our servers, not on your device. No system
        is perfectly secure; please use a strong password and enable the optional biometric lock in Settings.
      </p>

      <h2 id="international" style={H2}>11. International users</h2>
      <p style={P}>
        Our servers are in the United States. If you use the Service from elsewhere, your information is
        transferred to and processed in the United States.
      </p>

      <h2 id="tracking" style={H2}>12. Tracking and advertising</h2>
      <p style={P}>
        We do not use your data for third-party advertising and we do not track you across other companies'
        apps or websites.
      </p>

      <h2 id="changes" style={H2}>13. Changes</h2>
      <p style={P}>
        We may update this policy. We will post the new version here with a new date and, for material
        changes, notify you in the app.
      </p>

      <h2 id="contact" style={H2}>14. Contact</h2>
      <p style={P}>
        Otunity Labs LLC · 6000 Palm Trace Landings Dr APT 312, Davie, FL 33314, USA ·{" "}
        <a href="mailto:soporte@jchat.cloud" style={LINK}>soporte@jchat.cloud</a>
      </p>
    </>
  );
}
