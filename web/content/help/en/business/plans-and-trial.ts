import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'plans-and-trial',
  title: 'Plans and free trial',
  summary: 'Which plans exist for businesses, how to start your free trial and how to change plan or cancel.',
  goal: 'Choose a plan for your business, start your free trial and know how to change plan or cancel.',
  sections: [
    {
      id: 'plans',
      title: 'The plans',
      blocks: [
        { type: 'p', text: 'The business plans are at [jchat.cloud/pricing](https://jchat.cloud/pricing), in the **Venue POS — For your business** section. There are three cards:' },
        {
          type: 'list',
          items: [
            '**Business** ($49 / month): 1 venue or event, up to 10 staff members per venue with roles, reservations and a loyalty program, among other features.',
            '**Pro** ($99 / month): everything in Business, up to 10 venues or events in total, up to 50 staff members per venue, an AI menu assistant and description translation, and advanced analytics.',
            '**Custom** (Contact us): for chains or more than 10 businesses or events.',
          ],
        },
        { type: 'note', kind: 'important', text: 'The prices and what each plan includes are the ones that page shows the day you open it. If anything changes, what you see there applies.' },
      ],
    },
    {
      id: 'start-trial',
      title: 'Start your free trial',
      blocks: [
        { type: 'p', text: 'Your first subscription starts with 30 days free. You are not charged when you start; when the trial ends, your card is charged the price of the period you chose and the plan renews automatically until you cancel. If you cancel before the trial ends, you pay nothing.' },
        {
          type: 'steps',
          items: [
            'Go to [jchat.cloud/pricing](https://jchat.cloud/pricing). If you are not signed in, we ask you to sign in and you come back to the same page.',
            'Read the **Before you continue** notice and tick the box **I understand I will be charged automatically after the trial ends, and that I can cancel before without any charge.**',
            'Press **Subscribe** on the plan you want, Business or Pro.',
            'On the Stripe payment page, enter your card details. Stripe asks for the card even though the trial is free.',
            'When you come back, you will see your plan under **Billing** in the dashboard. It may take a moment to show.',
          ],
        },
        { type: 'note', kind: 'important', text: 'The free trial is only for each account\'s first subscription.' },
        { type: 'note', kind: 'tip', text: 'You can also subscribe from the dashboard, under **Payments** > **Billing**, with the **Subscribe** button in **Available plans**.' },
      ],
    },
    {
      id: 'promo-code',
      title: 'If you have a promo code',
      blocks: [
        { type: 'p', text: 'A promo code can give you a different number of trial days.' },
        {
          type: 'steps',
          items: [
            'On [jchat.cloud/pricing](https://jchat.cloud/pricing), find **Have a promo code?** and type your code in **Enter your code**.',
            'Press **Check**. You will see how many trial days it gives you and for which plan.',
            'Press **Subscribe** on that plan to apply it.',
          ],
        },
        { type: 'note', kind: 'important', text: 'Each code only applies to the plan it was created for. If it does not work, you will see a message like **That code has already been redeemed.**, **That code has expired.** or **That code doesn\'t apply to this plan.**' },
      ],
    },
    {
      id: 'change-or-cancel',
      title: 'Change plan or cancel',
      blocks: [
        { type: 'p', text: 'To change plan:' },
        {
          type: 'steps',
          items: [
            'Open the dashboard and go to **Payments** > **Billing**.',
            'Under **Available plans**, press **Change plan** on the plan you want.',
          ],
        },
        { type: 'p', text: 'To cancel or update your card:' },
        {
          type: 'steps',
          items: [
            'In **Billing**, press **Manage billing**.',
            'The Stripe billing portal opens: there you can update your card, download invoices or cancel your subscription.',
          ],
        },
        { type: 'p', text: 'When you cancel you will see **Your plan stays active until** and the date, and that it will not renew. Under the [Terms](/terms), cancellation takes effect at the end of the current period and what you already paid is not refunded, unless the law requires it. More detail in [Billing](/help/business/billing).' },
        { type: 'note', kind: 'important', text: 'The dashboard only opens with an active Business or Pro plan. If your plan is not active or your trial has ended, you cannot get in until you have one.' },
      ],
    },
  ],
};

export default chapter;
