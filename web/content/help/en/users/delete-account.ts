import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'delete-account',
  title: 'Delete your account',
  summary: 'How to delete your account from the app or the web, what is deleted and what is kept.',
  goal: 'You will delete your JChat account, with or without the app, knowing what happens to your data.',
  sections: [
    {
      id: 'before-you-start',
      title: 'Before you start',
      blocks: [
        { type: 'p', text: `Deleting your account is immediate and cannot be undone. If you only want a break from notifications or to hide your profile, see [Profile, posts and privacy](/help/users/profile-and-privacy).` },
        { type: 'note', kind: 'important', text: `If you own a venue, deleting your account closes your venue (it does not reopen) and cancels your subscription. Before you confirm you will see exactly what happens. Read [Close your venue](/help/business/close-your-venue).` },
      ],
    },
    {
      id: 'in-the-app',
      title: 'In the app',
      blocks: [
        {
          type: 'steps',
          items: [
            `Tap the **Profile** tab and then the settings icon.`,
            `Scroll to **Delete Account** and tap it.`,
            `On **Delete account**, read the notice and tap **Continue**.`,
            `On **Are you absolutely sure?**, tap **Delete my account**.`,
            `Wait for it to finish (**Deleting your account…**). You will see **Account deleted** and the app signs you out.`,
          ],
        },
        { type: 'note', kind: 'tip', text: `If something fails, the app shows a code. Write to us at [soporte@jchat.cloud](mailto:soporte@jchat.cloud) with that code.` },
      ],
    },
    {
      id: 'on-the-web',
      title: 'On the web',
      blocks: [
        {
          type: 'steps',
          items: [
            `Open [jchat.cloud/account/delete](/account/delete).`,
            `Tap **Sign in to delete my account** and sign in with the account you want to delete.`,
            `Back on the page, type the word **DELETE** to confirm.`,
            `Tap **Delete my account**.`,
          ],
        },
        { type: 'p', text: `If you can't sign in, write to [soporte@jchat.cloud](mailto:soporte@jchat.cloud) from the address on your account.` },
      ],
    },
    {
      id: 'what-is-deleted',
      title: 'What is deleted and what is kept',
      blocks: [
        { type: 'p', text: `Deleted right away:` },
        {
          type: 'list',
          items: [
            `Your profile: name, username, bio and photos.`,
            `Your messages (venue chats and direct messages) and your comments.`,
            `Your posts, stories, follows, blocks, reviews, notifications and settings.`,
          ],
        },
        { type: 'p', text: `Kept, without your identity or for a limited time:` },
        {
          type: 'list',
          items: [
            `Orders and payments: 7 years, without your personal data, for tax and accounting obligations.`,
            `Security logs: 90 days.`,
            `Moderation reports: 1 year after they are resolved (2 years for child safety).`,
            `Gifts and reports you sent or received are kept without your identity.`,
          ],
        },
        { type: 'p', text: `The full detail is in the [Privacy Policy](/privacy) and at [jchat.cloud/account/delete](/account/delete).` },
      ],
    },
  ],
};

export default chapter;
