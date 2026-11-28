import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'troubleshooting',
  title: 'Troubleshooting',
  summary: 'What to do if you can\'t join a venue chat, notifications don\'t arrive, you forgot your password or a payment failed.',
  goal: 'You will fix the most common problems on your own and know how to reach us if that is not enough.',
  sections: [
    {
      id: 'cant-join-chat',
      title: 'I can\'t join the chat',
      blocks: [
        { type: 'p', text: `To join a venue's chat you have to be at the venue. The app uses your location only while you use it, to confirm you are inside. It does not store your exact location.` },
        {
          type: 'steps',
          items: [
            `If the app says **You're not at** the venue or **You're … away**, get closer to the venue and try again.`,
            `If it says **We need your location**, tap **Allow location**.`,
            `If it says location is off for JChat, tap **Open Settings** and allow location for JChat in your phone's settings. Then go back to the app.`,
            `If it says **We couldn't read your location**, check that your phone's location is on and tap **Retry**.`,
          ],
        },
        { type: 'note', kind: 'important', text: `If you leave the venue's area, the app takes you out of the chat. To enter again, come back to the venue and scan the QR.` },
      ],
    },
    {
      id: 'notifications',
      title: 'Notifications don\'t arrive',
      blocks: [
        {
          type: 'steps',
          items: [
            `Open your phone's settings and check that JChat is allowed to send notifications.`,
            `In the app, open **Settings** and check that **Social** is on under **Notifications**.`,
            `If you see them but without content, check **Message preview**: with **Discreet** it only says You have something new on JChat.`,
          ],
        },
        { type: 'p', text: `More about these settings in [Profile, posts and privacy](/help/users/profile-and-privacy#settings).` },
      ],
    },
    {
      id: 'forgot-password',
      title: 'I forgot my password',
      blocks: [
        {
          type: 'steps',
          items: [
            `On the sign-in with email screen, tap **Forgot your password?**.`,
            `Type your email and tap **Send code**.`,
            `Type the 6-digit code you received and tap **Verify**. If it doesn't arrive, tap **Resend code**.`,
            `Type your new password (at least 8 characters) twice and tap **Save Password**.`,
          ],
        },
        { type: 'note', kind: 'tip', text: `If you see The code is incorrect or has expired, ask for a new one. If you are told to wait a moment, wait and ask again. You can also use the forgot-password option at [jchat.cloud/forgot-password](/forgot-password).` },
      ],
    },
    {
      id: 'payment-failed',
      title: 'A payment failed',
      blocks: [
        { type: 'p', text: `If you see **Payment failed**, tap **Try again**. To see how an order is paid, see [Order and pay](/help/users/order-and-pay).` },
        {
          type: 'list',
          items: [
            `**To order you need to be at** the venue: tap **Allow location / Retry** once you are inside.`,
            `**We couldn't verify your identity**: the payment was not made. Try again and confirm with your fingerprint or face.`,
            `**The total changed**: prices were updated and nothing was charged. Review the new total and pay again.`,
            `**This venue doesn't accept in-app payments yet**: you can order at the counter.`,
          ],
        },
        { type: 'note', kind: 'important', text: `Refunds are handled by the venue that served you. Contact them first with your order number. If you paid through JChat and can't reach the venue, write to us.` },
      ],
    },
    {
      id: 'contact',
      title: 'How to contact us',
      blocks: [
        { type: 'p', text: `Write to [soporte@jchat.cloud](mailto:soporte@jchat.cloud). Include the email on your account and, for an order, the order number. You can also use [Contact](/contact) or the [Help & Support](/support) page.` },
        { type: 'p', text: `If you want to report someone, see [Safety](/help/users/safety).` },
      ],
    },
  ],
};

export default chapter;
