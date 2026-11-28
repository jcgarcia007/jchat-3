import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'billing',
  title: 'Billing',
  summary: 'Check your plan, change plans, update your card and download your invoices.',
  goal: 'You will see the status of your subscription and manage your payment method and invoices.',
  sections: [
    {
      id: 'where-to-find-it',
      title: 'Where billing lives',
      blocks: [
        {
          type: 'p',
          text: 'Your business subscription is managed in the web dashboard, not in the app. In the side menu, open the **Payments** group and go to **Billing**. The page is called **Billing & Subscription**.',
        },
        {
          type: 'p',
          text: 'Prices and what each plan includes are in [Plans and free trial](/help/business/plans-and-trial).',
        },
      ],
    },
    {
      id: 'your-plan',
      title: 'Read your plan status',
      blocks: [
        {
          type: 'p',
          text: 'Under **Current plan** you see the name of your plan and its status: **Free Trial**, **Active**, **Payment issue** or **Canceled**. You also see:',
        },
        {
          type: 'image',
          src: '/help/business/billing/billing-en.webp',
          alt: 'The Billing & Subscription screen with the current plan and the available plans.',
          platform: 'web',
          width: 1280,
          height: 800,
        },
        {
          type: 'list',
          items: [
            '**Trial ends**: the date your free trial ends, with the days you have left.',
            '**Billing**: how often you are charged (**Every month**, **Every 6 months** or **Every year**).',
            '**Renews**: the date of your next renewal.',
          ],
        },
        {
          type: 'p',
          text: 'When 3 days or fewer are left in your trial, the dashboard reminds you and asks you to add a payment method to continue without interruption.',
        },
        {
          type: 'note',
          kind: 'tip',
          text: 'If you just paid and your plan has not changed, wait a moment and reload the page. The dashboard warns that it may take a moment to update.',
        },
      ],
    },
    {
      id: 'subscribe-or-change',
      title: 'Subscribe or change plans',
      blocks: [
        {
          type: 'steps',
          items: [
            'In **Billing**, scroll to **Available plans**.',
            'If you do not have a business plan yet, press **Subscribe** on the plan you want. We take you to the payment page.',
            'If you already have a plan, press **Change plan** on the new plan. The billing portal opens, where you make the change.',
            'When you come back to the dashboard you will see **Subscription updated!** or **Checkout was cancelled. Your plan was not changed.**',
          ],
        },
        {
          type: 'p',
          text: 'The **Custom** plan has no online payment: press **Contact us** and an email opens so you can write to [ventas@jchat.cloud](mailto:ventas@jchat.cloud).',
        },
      ],
    },
    {
      id: 'card-and-invoices',
      title: 'Update your card, download invoices or cancel',
      blocks: [
        {
          type: 'steps',
          items: [
            'In **Billing**, scroll to **Update payment method or billing details**.',
            'To change your card or cancel your subscription, press **Manage billing**.',
            'To see and download every invoice and receipt, scroll to **Payment history** and press **View invoices and receipts**.',
          ],
        },
        {
          type: 'note',
          kind: 'important',
          text: 'Both buttons open the Stripe billing portal. If the portal does not open because you do not have a billing account yet, subscribe to a plan first.',
        },
      ],
    },
    {
      id: 'payment-problem',
      title: 'If there is a problem with your payment',
      blocks: [
        {
          type: 'p',
          text: 'If a charge fails, your plan changes to **Payment issue** and you will see the notice "There\'s a problem with your payment. Update your payment method to keep your plan active."',
        },
        {
          type: 'steps',
          items: [
            'Open **Billing**.',
            'Press **Manage billing**.',
            'Update your card in the portal.',
          ],
        },
        {
          type: 'p',
          text: 'If you cannot sort it out, write to us at [soporte@jchat.cloud](mailto:soporte@jchat.cloud).',
        },
      ],
    },
  ],
};

export default chapter;
