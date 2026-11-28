import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'register-your-business',
  title: 'Register your business',
  summary: 'Create your account, register your venue and get it ready to be verified and shown on the map.',
  goal: 'Create your account, register your venue on JChat and get it ready for review so it shows on the app map.',
  sections: [
    {
      id: 'create-account',
      title: 'Create your account',
      blocks: [
        { type: 'p', text: 'Your account is the same for the app and for the business dashboard. You must be 18 or older.' },
        {
          type: 'steps',
          items: [
            'Go to [jchat.cloud/auth/register](https://jchat.cloud/auth/register).',
            'Enter your **Full name**, your **Email** and a **Password** of at least 8 characters, with a letter and a number. Repeat it in **Confirm password**.',
            'Press **Continue →**. You can also use **Continue with Google**.',
            'In step 2, enter your **Date of birth**, choose your **Language** and a **Username** (3 to 30 characters: lowercase letters, numbers and underscore).',
            'Accept the [Terms of Service](/terms) and the [Privacy Policy](/privacy) and press **Create my account 🎉**.',
          ],
        },
        { type: 'note', kind: 'tip', text: 'If you see **Please confirm your email address first. Check your inbox.** when you sign in, open the email we sent you and tap the confirmation link.' },
      ],
    },
    {
      id: 'choose-a-plan',
      title: 'Choose a plan before you register the venue',
      blocks: [
        { type: 'p', text: 'To register a venue, your account needs an active Business or Pro plan; the free trial counts. Without a plan, the registration form shows **Business limit reached**. See the plans and start your trial in [Plans and free trial](/help/business/plans-and-trial).' },
        { type: 'note', kind: 'important', text: 'The Business plan allows 1 venue or event. The Pro plan allows up to 10 venues or events in total.' },
      ],
    },
    {
      id: 'venue-info',
      title: 'Venue details and location',
      blocks: [
        { type: 'p', text: 'With your plan active, open [jchat.cloud/business/register](https://jchat.cloud/business/register) and sign in if asked. If you open the dashboard with an account that has no venue, you will also see the **Register my business** button.' },
        { type: 'note', kind: 'important', text: 'This form appears almost entirely in English. Here we use the names exactly as you see them on screen.' },
        {
          type: 'steps',
          items: [
            'In the **Info** step, enter the **Business Name** and choose the **Category** (for example Restaurant, Café or Bar & Nightclub).',
            'If you like, write a **Description** (up to 500 characters), upload a photo with **Upload cover photo** (JPG, PNG or WebP) and pick an emoji in **Icon Emoji**.',
            'Press **Continue**. In the **Location** step, enter the **Street Address** and the **Phone**. You can add your **Website**.',
            'Press **Continue**. JChat looks up your address on the map and fills in **Latitude** and **Longitude**; you stay on this step so you can check them.',
            'Check the coordinates and press **Continue** again.',
          ],
        },
        {
          type: 'list',
          items: [
            'A location is required: it is how we confirm people are at your venue. If the address is not found, type the latitude and longitude yourself.',
            '**Radius (m)** starts at 100 and cannot be less than 10. It is the radius of your venue.',
          ],
        },
      ],
    },
    {
      id: 'hours-and-finish',
      title: 'Hours and finishing',
      blocks: [
        {
          type: 'steps',
          items: [
            'In the **Hours** step, tap the days you are open under **Working Days** (Mo to Su). You can also use **Select all** or **Clear all**.',
            'For each open day, choose the opening and closing time. Tick **Open 24 h** if you never close. If you close after midnight, you will see the notice **Closes the next day**.',
            'Use **Copy to all days** to repeat one day\'s hours on the others.',
            'Press **Continue**. The last step is called **Stripe**: move past it without connecting anything.',
            'Press **Complete Registration**.',
          ],
        },
        { type: 'note', kind: 'important', text: 'Do not press **Connect Stripe** in this form: it does not connect your real account yet. Connect Stripe from **Payments** once you finish registering, as explained in [Get paid](/help/business/get-paid). Without Stripe connected, ordering and payments in the app are unavailable.' },
      ],
    },
    {
      id: 'review-and-map',
      title: 'Verification and the map',
      blocks: [
        { type: 'p', text: 'When you finish you will see **Verify your business**. The screen says we received your business, that an administrator will review it within 24 hours and that we will let you know by email. You do not need to send anything else.' },
        {
          type: 'steps',
          items: [
            'Press **Go to my dashboard**.',
            'While you wait, set up your [menu](/help/business/menu) and connect your [payments](/help/business/get-paid).',
          ],
        },
        { type: 'p', text: 'Once your business is verified, it shows on the map and among the nearby venues in the app. Until it is verified, it does not appear. If that screen says **Your business is already verified**, you are all set.' },
        { type: 'note', kind: 'tip', text: 'Questions about verification? Write to us at [soporte@jchat.cloud](mailto:soporte@jchat.cloud).' },
      ],
    },
  ],
};

export default chapter;
