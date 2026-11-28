import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'get-paid',
  title: 'Get paid',
  summary: 'Connect your Stripe account to receive the money from orders and check its status from the dashboard.',
  goal: 'Connect your Stripe account so the money from the orders your customers pay reaches your business.',
  sections: [
    {
      id: 'how-it-works',
      title: 'How it works',
      blocks: [
        { type: 'p', text: 'Customers pay for their orders by card inside JChat. For the money to reach your account, you connect your business with Stripe, which runs its own secure verification.' },
        { type: 'note', kind: 'important', text: 'Without Stripe connected, ordering and payments in the app are unavailable.' },
      ],
    },
    {
      id: 'connect-stripe',
      title: 'Connect Stripe',
      blocks: [
        {
          type: 'steps',
          items: [
            'Open the dashboard and go to **Payments**.',
            'If you have more than one venue, choose which one in the **Business** selector. Each venue needs its own Stripe account.',
            'You will see **Connect Stripe to receive your payments**. Press **Connect with Stripe**.',
            'Stripe\'s secure page opens. Fill in the details it asks for and submit them.',
            'When you finish, Stripe sends you back to JChat. Open **Payments** again to see your status.',
          ],
        },
        { type: 'note', kind: 'tip', text: 'If you see **The link expired — try again.**, press the connect button again to get a new link.' },
      ],
    },
    {
      id: 'check-your-status',
      title: 'Check your status',
      blocks: [
        { type: 'p', text: 'In **Payments** you will see one of these states:' },
        {
          type: 'list',
          items: [
            '**Verification pending — you can\'t receive payments yet**: Stripe needs more information to activate your account. Press **Complete verification** to continue where you left off.',
            '**Connected — you\'re receiving payments from your orders**: your account is active. Below you see **Charges enabled** and **Payouts enabled**.',
          ],
        },
        { type: 'p', text: 'In the pending state you also see **Details submitted**, so you know what your account is missing.' },
      ],
    },
    {
      id: 'stripe-dashboard',
      title: 'Your Stripe dashboard',
      blocks: [
        {
          type: 'steps',
          items: [
            'With your account connected, in **Payments** press **Open Stripe dashboard**.',
            'Your Stripe dashboard opens in a new tab, where you manage your account and your payouts.',
          ],
        },
        { type: 'note', kind: 'important', text: 'JChat does not set the schedule of deposits to your bank. Check that in your Stripe dashboard.' },
      ],
    },
    {
      id: 'tax-and-tips',
      title: 'Tax and tips',
      blocks: [
        { type: 'p', text: 'Each order shows **Subtotal**, **Tax**, **Tip** and **Total**. JChat calculates the tax on each order for you. To see that breakdown, go to [Orders](/help/business/orders#order-details).' },
      ],
    },
  ],
};

export default chapter;
