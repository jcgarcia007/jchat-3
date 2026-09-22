/** Terms of Service — English content. Public page: no var(--*), fixed hex only. */

const LINK: React.CSSProperties = { color: "#5C7CFA", textDecoration: "underline" };
const H2: React.CSSProperties = { fontSize: "18px", fontWeight: 700, marginTop: "36px", marginBottom: "10px", color: "#111827" };
const P: React.CSSProperties = { lineHeight: "1.7", marginTop: "0", marginBottom: "14px", color: "#374151" };

export function TermsEN() {
  return (
    <>
      <h1 style={{ fontSize: "28px", fontWeight: 800, color: "#111827", marginBottom: "6px", letterSpacing: "-0.5px" }}>
        Terms of Service
      </h1>
      <p style={{ color: "#6B7280", fontSize: "14px", marginTop: "0", marginBottom: "32px" }}>
        Last updated: September 21, 2026
      </p>

      <p style={P}>
        These Terms are an agreement between you and <strong>Otunity Labs LLC</strong> ("Otunity Labs", "we")
        for use of the JChat app, jchat.cloud, the business dashboard (including dashboard.tabpos.cloud) and
        related services (the "Service"). By creating an account or using the Service you agree to these
        Terms and to our{" "}
        <a href="/privacy" style={LINK}>Privacy Policy</a>.
      </p>

      {/* Table of contents */}
      <nav
        style={{
          background: "#F3F4F6",
          borderRadius: "10px",
          padding: "20px 24px",
          marginBottom: "40px",
          fontSize: "14px",
        }}
      >
        <p style={{ fontWeight: 700, marginTop: 0, marginBottom: "10px", color: "#111827" }}>Contents</p>
        <ol style={{ paddingLeft: "18px", margin: 0, lineHeight: "2" }}>
          <li><a href="#eligibility" style={LINK}>Eligibility</a></li>
          <li><a href="#your-account" style={LINK}>Your account</a></li>
          <li><a href="#the-service" style={LINK}>The Service</a></li>
          <li><a href="#community" style={LINK}>Community rules</a></li>
          <li><a href="#your-content" style={LINK}>Your content</a></li>
          <li><a href="#orders-payments" style={LINK}>Orders, payments and tips</a></li>
          <li><a href="#business-accounts" style={LINK}>Business accounts</a></li>
          <li><a href="#plans-billing" style={LINK}>Plans and billing</a></li>
          <li><a href="#affiliate" style={LINK}>Affiliate program</a></li>
          <li><a href="#location-safety" style={LINK}>Location and safety</a></li>
          <li><a href="#ip" style={LINK}>Intellectual property</a></li>
          <li><a href="#termination" style={LINK}>Termination</a></li>
          <li><a href="#disclaimers" style={LINK}>Disclaimers</a></li>
          <li><a href="#liability" style={LINK}>Limitation of liability</a></li>
          <li><a href="#indemnity" style={LINK}>Indemnity</a></li>
          <li><a href="#governing-law" style={LINK}>Governing law and disputes</a></li>
          <li><a href="#changes" style={LINK}>Changes</a></li>
          <li><a href="#contact-terms" style={LINK}>Contact</a></li>
        </ol>
      </nav>

      <h2 id="eligibility" style={H2}>1. Eligibility</h2>
      <p style={P}>
        You must be at least <strong>18 years old</strong> and able to enter a binding contract. Business
        accounts must be created by a person authorized to act for the business.
      </p>

      <h2 id="your-account" style={H2}>2. Your account</h2>
      <p style={P}>
        Keep your credentials confidential; you are responsible for activity on your account. Provide
        accurate information. One person, one account. We may suspend or terminate accounts that violate
        these Terms.
      </p>

      <h2 id="the-service" style={H2}>3. The Service</h2>
      <p style={P}>
        JChat lets members find nearby venues and groups, chat with people at the same place, and order and
        pay at participating venues. It lets business owners manage their venue, menu, staff, orders, payments
        and related tools. Some features require a paid plan. We may change, add or remove features.
      </p>

      <h2 id="community" style={H2}>4. Community rules</h2>
      <p style={P}>
        Do not post or do anything that is illegal, harassing, threatening, hateful, sexually explicit,
        violent, fraudulent, spam, or that infringes others' rights or privacy. Do not impersonate others,
        share others' personal information without consent, or interfere with the Service or other users. Do
        not use the Service to sell or promote illegal goods. Venues may set additional rules for their chats.
        We and venue owners may remove content, mute, remove or ban users, and we may suspend accounts, at
        our discretion.
      </p>
      <p style={P}>
        <strong>Report</strong> content or users from their profile or the message menu; we review reports
        and act on those that violate these rules, normally within 24 hours. <strong>Block</strong> anyone to
        stop seeing their content.
      </p>

      <h2 id="your-content" style={H2}>5. Your content</h2>
      <p style={P}>
        You own what you post. You grant Otunity Labs and, for content posted in a venue's chat or about a
        venue, that venue, a worldwide, non-exclusive, royalty-free license to host, store, display,
        reproduce and distribute your content as needed to operate and promote the Service. You are
        responsible for your content and confirm you have the rights to post it. We may remove content that
        violates these Terms.
      </p>

      <h2 id="orders-payments" style={H2}>6. Orders, payments and tips</h2>
      <p style={P}>
        When you order at a venue, <strong>the venue is the seller</strong>; JChat provides the ordering and
        payment tools. Prices, availability, taxes, refunds and food quality are the venue's responsibility.
        Payments are processed by <strong>Stripe</strong>; by paying you agree to Stripe's terms. Tips go to
        the venue. Refund requests should be made to the venue; where JChat processed the payment we may
        assist and may issue refunds through Stripe at the venue's request. Orders placed with a table code
        or without one are binding once accepted by the venue.
      </p>

      <h2 id="business-accounts" style={H2}>7. Business accounts</h2>
      <p style={P}>
        Business owners are responsible for their venue's listing, menu, prices, taxes, employees, compliance
        with local laws (including alcohol laws) and for the conduct of their staff on the Service. Payouts
        are made by Stripe under your Stripe Connect agreement. You must not use the point-of-sale tools to
        process payments you are not entitled to receive. Reports and moderation logs about your venue may be
        reviewed by Otunity Labs.
      </p>

      <h2 id="plans-billing" style={H2}>8. Plans and billing</h2>
      <p style={P}>
        Paid plans (for example, Business and Pro) are billed in advance, monthly, through Stripe, and renew
        automatically until cancelled. You can cancel at any time from the dashboard; cancellation takes
        effect at the end of the current billing period and fees already paid are not refunded except where
        the law requires. We may change plan prices with notice. Trials, if offered, convert to paid plans
        unless cancelled before the trial ends. Any plans offered inside the mobile apps are sold under the
        rules of the respective app store.
      </p>

      <h2 id="affiliate" style={H2}>9. Affiliate program</h2>
      <p style={P}>
        If you participate in our affiliate program, additional terms shown in the program apply. Commissions
        are paid only for valid, non-fraudulent referrals.
      </p>

      <h2 id="location-safety" style={H2}>10. Location and safety</h2>
      <p style={P}>
        The Service uses your location while you use it. Do not rely on the Service for emergencies. You are
        responsible for your safety when meeting people or visiting venues.
      </p>

      <h2 id="ip" style={H2}>11. Intellectual property</h2>
      <p style={P}>
        The Service, its software, design and trademarks (including "JChat" and "Tab POS") belong to Otunity
        Labs or its licensors. You may not copy, modify, reverse-engineer or resell the Service.
      </p>

      <h2 id="termination" style={H2}>12. Termination</h2>
      <p style={P}>
        You may stop using the Service and delete your account at any time (Settings → Delete account). We
        may suspend or terminate your access if you violate these Terms, create risk for others, or where
        required by law. Sections that by their nature should survive (content license for content already
        shared, payments owed, disclaimers, limitation of liability) survive termination.
      </p>

      <h2 id="disclaimers" style={H2}>13. Disclaimers</h2>
      <p style={P}>
        The Service is provided "as is" and "as available". We do not guarantee that it will be
        uninterrupted, error-free or that venue information (hours, prices, availability) is accurate. Venues
        are independent businesses; we are not responsible for their products or conduct.
      </p>

      <h2 id="liability" style={H2}>14. Limitation of liability</h2>
      <p style={P}>
        To the fullest extent permitted by law, Otunity Labs will not be liable for indirect, incidental,
        special, consequential or punitive damages, or for loss of profits, data or goodwill, arising from
        your use of the Service. Our total liability for any claim will not exceed the greater of the amounts
        you paid us in the 12 months before the claim or USD 100.
      </p>

      <h2 id="indemnity" style={H2}>15. Indemnity</h2>
      <p style={P}>
        You will defend and hold Otunity Labs harmless from claims arising from your content, your use of
        the Service or your violation of these Terms or the law.
      </p>

      <h2 id="governing-law" style={H2}>16. Governing law and disputes</h2>
      <p style={P}>
        These Terms are governed by the laws of the State of Florida, USA. Disputes will be resolved in the
        state or federal courts located in Broward County, Florida, and you consent to their jurisdiction. If
        a provision is unenforceable, the rest remains in effect.
      </p>

      <h2 id="changes" style={H2}>17. Changes</h2>
      <p style={P}>
        We may update these Terms; we will post the new version with its date and, for material changes,
        notify you in the app. Continued use after changes means you accept them.
      </p>

      <h2 id="contact-terms" style={H2}>18. Contact</h2>
      <p style={P}>
        Otunity Labs LLC · 6000 Palm Trace Landings Dr APT 312, Davie, FL 33314, USA ·{" "}
        <a href="mailto:jgarcia@otunitylabs.com" style={LINK}>jgarcia@otunitylabs.com</a>
      </p>
    </>
  );
}
