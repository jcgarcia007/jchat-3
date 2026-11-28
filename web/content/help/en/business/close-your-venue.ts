import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'close-your-venue',
  title: 'Close your venue and delete your account',
  summary: 'What happens when you close your venue: subscription, team, reservations and data.',
  goal: 'You will know how to close your venue by deleting your owner account and what happens to everything you have on JChat.',
  sections: [
    {
      id: 'how-it-works',
      title: 'How a venue is closed',
      blocks: [
        {
          type: 'p',
          text: 'On JChat a venue is closed by deleting its owner\'s account. The closing applies to all the venues you own at once.',
        },
        {
          type: 'note',
          kind: 'important',
          text: 'It is immediate and cannot be undone. A closed venue is not reopened.',
        },
        {
          type: 'p',
          text: 'Before you confirm, the app and the website show you what will happen to your venue.',
        },
      ],
    },
    {
      id: 'before-you-start',
      title: 'Before you start',
      blocks: [
        {
          type: 'p',
          text: 'Two things can stop you. If either one happens, nothing is deleted and you can try again once it is sorted out. If closing fails for another reason, the app says “Deleting your account closes your venues. We couldn\'t finish closing them right now and nothing has been deleted. Try again; if it keeps happening, write to…” followed by the contact address:',
        },
        {
          type: 'list',
          items: [
            '**Orders in progress or open tables**: close them first. The app tells you how many you have.',
            '**Money waiting in Stripe**: if Stripe still holds sales of yours that have not reached your bank, wait for them to arrive (usually 2 to 7 days) and come back when the balance is zero.',
          ],
        },
        {
          type: 'p',
          text: 'When your balance blocks you, the app shows the **Open my Stripe dashboard** button so you can check it.',
        },
      ],
    },
    {
      id: 'close-in-app',
      title: 'Close it from the app',
      blocks: [
        {
          type: 'steps',
          items: [
            'In the app, open **Profile** and go to **Settings**.',
            'Tap **Delete Account**.',
            'Read the **You have a venue** screen (or **You have N venues**). It shows what will happen.',
            'Tick the box **I understand my venue will close and this cannot be undone.**',
            'Tap **Continue and delete**.',
            'Confirm with **Delete everything**. It can take up to 30 seconds.',
            'When you see **Account deleted**, the venue is closed and you are signed out.',
          ],
        },
      ],
    },
    {
      id: 'close-on-web',
      title: 'Or close it from the website',
      blocks: [
        {
          type: 'steps',
          items: [
            'Open [Delete your account](/account/delete) and sign in with your owner account.',
            'You will see **You have a business on JChat** with the name of your venue and what will happen.',
            'Tick **I understand my venue will close and this cannot be undone.**',
            'Type the word **DELETE** where the page asks for it.',
            'Press **Delete my account and close my venue**.',
          ],
        },
        {
          type: 'p',
          text: 'If you cannot sign in, write to [soporte@jchat.cloud](mailto:soporte@jchat.cloud) from the email address on your account.',
        },
      ],
    },
    {
      id: 'what-happens',
      title: 'What happens to everything',
      blocks: [
        {
          type: 'list',
          items: [
            '**Your venue**: it is hidden from the map and stops taking orders.',
            '**Your subscription**: it is cancelled today. The period you already paid is not refunded.',
            '**Your team**: they lose access and get a notice. Their accounts stay active.',
            '**Future reservations**: they are cancelled and we notify your customers.',
            '**Your personal data**: it is deleted right now (profile, photos and messages).',
            '**Orders, payments and receipts**: they are kept for 7 years without your personal data, as tax law requires.',
            '**Reviews, posts and the venue chat**: they stop being shown.',
          ],
        },
        {
          type: 'p',
          text: 'If you have more than one venue, all of this applies to each one. More about data in [Delete your account](/account/delete) and in the [Privacy Policy](/privacy).',
        },
      ],
    },
  ],
};

export default chapter;
