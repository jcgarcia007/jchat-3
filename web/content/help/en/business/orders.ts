import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'orders',
  title: 'Orders',
  summary: 'See the orders that come in, check their details and mark them as delivered from the dashboard.',
  goal: 'See your customers\' orders in the dashboard, check their details and mark them as delivered.',
  sections: [
    {
      id: 'see-your-orders',
      title: 'See your orders',
      blocks: [
        { type: 'p', text: 'Orders arrive when a customer pays from the app. To see them, open the dashboard and go to **Orders** > **Orders**. The list updates live: you do not need to reload the page.' },
        {
          type: 'image',
          src: '/help/business/orders/dash-en.webp',
          alt: 'The dashboard Orders screen with the status filters and the list of orders.',
          platform: 'web',
          width: 1280,
          height: 800,
        },
        {
          type: 'list',
          items: [
            '**Order**: the order number, the same one your customer sees.',
            '**Customer**: who ordered. If there is no customer, you will see **Guest**.',
            '**Status**, **Items**, **Total** and **Time**: where it stands, how many products it has, how much it adds up to and how long ago it arrived.',
          ],
        },
        { type: 'note', kind: 'tip', text: 'At the top there are filters to see only **Pending**, **Preparing**, **Ready**, **Delivered** or **Cancelled**, each with its count. **All** shows them together.' },
      ],
    },
    {
      id: 'order-statuses',
      title: 'Order statuses',
      blocks: [
        { type: 'p', text: 'Each order has one of these statuses:' },
        {
          type: 'list',
          items: [
            '**Pending**: it arrived and has not been started yet.',
            '**Preparing**: it is being prepared.',
            '**Ready**: it is ready to be handed over.',
            '**Delivered**: it has been handed to the customer.',
            '**Cancelled**: it was cancelled.',
          ],
        },
        { type: 'note', kind: 'important', text: 'On this screen you can only mark an order as **Delivered**.' },
      ],
    },
    {
      id: 'order-details',
      title: 'Order details',
      blocks: [
        {
          type: 'steps',
          items: [
            'On the order\'s row, press **View**.',
            'Check each product with its quantity and notes, and the table if the order has one.',
            'Look at the breakdown: **Subtotal**, **Discount** (if any), **Tax**, **Tip** and **Total**.',
          ],
        },
        { type: 'p', text: 'If the order has an estimated time, you will see a line like **ETA 15 min · placed 2m ago**. If a customer sent it as a gift, the list shows **🎁 Gift from** the sender **to** the recipient, and the detail shows the table and delivery notes.' },
      ],
    },
    {
      id: 'mark-delivered',
      title: 'Mark an order as delivered',
      blocks: [
        {
          type: 'steps',
          items: [
            'When you hand over the order, find it in **Orders**.',
            'If it is **Ready**, press **Delivered** on its row. If it is **Pending** or **Preparing**, press **View** and then **Delivered**.',
            'The order moves to **Delivered** and your customer gets a notice.',
          ],
        },
        { type: 'note', kind: 'important', text: 'Marking **Delivered** cannot be undone from this screen. Do it once the order is in your customer\'s hands.' },
      ],
    },
  ],
};

export default chapter;
