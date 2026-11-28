import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'order-and-pay',
  title: 'Order and pay',
  summary: 'How to see the menu, build your order, choose table or counter, add a tip, pay and follow your order.',
  goal: 'You will order from a venue’s menu, pay from your phone and follow your order until it arrives.',
  sections: [
    {
      id: 'menu',
      title: 'See the menu and add items',
      blocks: [
        {
          type: 'steps',
          items: [
            'Open the venue menu. You can do it with **Menu** on the venue card, with the menu icon at the top of the chat, or with **Menu** in the panel the **+** button of the chat opens.',
            'To look for something, type in **Search menu…**.',
            'Tap an item to see its details. If it has options, choose them: **Size** (required), **Extras** (optional) and **Special Instructions**, for example allergies.',
            'Change the **Quantity** if you want more than one.',
            'Tap **Add to Cart**. If a size is still missing, the button says **Select a size**.',
            'At the bottom you will see the **View Cart** button with the total of what you have.',
          ],
        },
        {
          type: 'image',
          src: '/help/users/order-and-pay/menu-en.webp',
          alt: 'A venue menu with categories, prices and the plus button to add each product.',
          platform: 'ios',
          width: 780,
          height: 1696,
        },
        {
          type: 'note',
          kind: 'important',
          text: 'You can see the menu wherever you are. To order, you have to be inside the venue. If you are outside, the menu is read-only and the app tells you that you can only view it from outside, unless the venue allows ordering for pick-up.',
        },
        {
          type: 'note',
          kind: 'tip',
          text: 'Some items carry the notice **Only for ages 21 and over. You will be asked for ID at the venue.** If the venue is closed, the app tells you that you can order when it opens.',
        },
      ],
    },
    {
      id: 'cart',
      title: 'Your cart: table or counter',
      blocks: [
        {
          type: 'steps',
          items: [
            'Tap **View Cart**. The screen is called **Your Order**.',
            'Check the items. The quantity buttons change how many you have; if you go below one, the app asks whether you want to remove it.',
            'Under **How would you like your order?**, choose **Table** (the waiter brings it) or **Counter** (you pick it up).',
            'If you chose **Table**, type your table or location in **Table / location**, for example 5, bar or terrace. It is required.',
            'Tap **Proceed to Checkout**. The button shows the subtotal.',
          ],
        },
        {
          type: 'image',
          src: '/help/users/order-and-pay/cart-en.webp',
          alt: 'The cart with the Table or Counter option, the table field and the button that asks you to enter your table to continue.',
          platform: 'ios',
          width: 780,
          height: 1696,
        },
        {
          type: 'p',
          text: 'If the button is disabled, it tells you what is missing, for example **Enter your table to continue**. Below the cart, the app notes that **Taxes and tip are calculated at checkout.**',
        },
        {
          type: 'note',
          kind: 'tip',
          text: 'When only a few units of an item are left, the app shows **Limited stock** and does not let you order more than there are.',
        },
      ],
    },
    {
      id: 'checkout',
      title: 'Tip, tax and total',
      blocks: [
        {
          type: 'p',
          text: 'The **Checkout** screen shows you the exact price before charging: the app recalculates it every time you change the order or the tip.',
        },
        {
          type: 'steps',
          items: [
            'Check the order summary. If something is not what you wanted, tap **Edit**.',
            'Under **Add a Tip**, choose **10%**, **15%** or **20%**, or tap **Other** and type the amount in dollars. 15% is already selected.',
            'Check the breakdown: **Subtotal**, the **Tax**, the **Tip** and the **Total**.',
            'Tap the **Pay** button with the total.',
          ],
        },
        {
          type: 'list',
          items: [
            'Each venue sets its own tax. If the venue has not set it up, the app shows **Taxes are not configured by this business.**',
            'The tip goes to the venue.',
            'If the price changed while you were paying, the app shows **The total changed** and charges nothing. Review the new total and pay again.',
          ],
        },
        {
          type: 'note',
          kind: 'important',
          text: 'Some venues do not take payments in the app yet: you will see **This venue doesn\'t accept in-app payments yet. You can order at the counter.** If you are outside the venue, the app tells you that you need to be there to order; tap **Allow location / Retry**, or **Order for pick-up** if the venue allows it.',
        },
      ],
    },
    {
      id: 'payment-methods',
      title: 'Pay with a card, Apple Pay or Google Pay',
      blocks: [
        {
          type: 'p',
          text: 'Payment happens in a Stripe payment sheet that opens over the app. There you choose how to pay: with a card, with one you saved, and with Apple Pay on iPhone or Google Pay on Android if you have them set up on your phone. Payments are processed by Stripe: the app shows **Secured by Stripe**.',
        },
        {
          type: 'steps',
          items: [
            'Tap **Pay**. If you turned on **Use Face ID / fingerprint** in **Settings**, the app asks you to verify yourself before charging.',
            'In the payment sheet, choose how to pay or type your card details.',
            'Confirm the payment.',
            'Wait while the app shows **Processing payment…**.',
          ],
        },
        {
          type: 'p',
          text: 'When the payment is done, the app may ask **Save card for faster checkout?** Tap **Save card** or **Not now**.',
        },
        {
          type: 'note',
          kind: 'important',
          text: 'If you do not pass the Face ID or fingerprint check, the payment is not made: tap **Try again**. If the payment fails, the app shows **Payment failed** and you can try again. For more help, see [Troubleshooting](/help/users/troubleshooting#payment-failed).',
        },
      ],
    },
    {
      id: 'track-order',
      title: 'Follow your order',
      blocks: [
        {
          type: 'p',
          text: 'When the payment is done you see **Payment confirmed!** with your **Order number**, the business and the order type. Below, the app reminds you: “You can follow it in My orders.”',
        },
        {
          type: 'steps',
          items: [
            'Tap **View order**. If the app is still finishing your order, the button says **View my orders**.',
            'Follow the steps **Confirmed**, **Preparing** and **Ready**. At the end you will see **Delivered!**',
            'To let the venue know something, tap **Let the venue know** and choose **I\'m on my way**, **I\'ve arrived at the venue** or **I have a question about my order** (maximum 200 characters). Tap **Send**.',
            'If you ordered to your table and you are at the venue, you can also tap **Call the waiter**.',
          ],
        },
        {
          type: 'list',
          items: [
            'While the venue has not confirmed yet, the app says **Order received — waiting to be confirmed.** or **Waiting for the business\'s approval.**',
            'If the venue rejects the order, you will see **Rejected** with the reason. If you see **Under review**, contact the venue.',
            'To get back to an order later, go to **My orders**: in the chat, tap the three dots and then **My account and orders**; or go to **Settings** and tap **My orders**.',
            'An order in progress also appears above your notifications in **Messages**, with **In progress**.',
          ],
        },
        {
          type: 'note',
          kind: 'tip',
          text: 'Updates on your order reach you as notifications: received, confirmed, preparing, ready and delivered.',
        },
      ],
    },
    {
      id: 'receipts-refunds',
      title: 'Your receipt and refunds',
      blocks: [
        {
          type: 'p',
          text: 'Your paid orders stay in **My orders**. When you open one you see the items, the **Subtotal**, the **Tax**, the **Tip** and the **Total**.',
        },
        {
          type: 'steps',
          items: [
            'Talk first to the venue that served you and give them your order number. Refunds are handled by the venue.',
            'If you paid through JChat and cannot reach the venue, write to us at [soporte@jchat.cloud](mailto:soporte@jchat.cloud) with your order number.',
          ],
        },
        {
          type: 'note',
          kind: 'important',
          text: 'The venue is the seller: prices, availability, taxes and refunds are its responsibility. Read the [Terms of Service](/terms) and write to us from [Contact](/contact) if you need more help.',
        },
      ],
    },
  ],
};

export default chapter;
