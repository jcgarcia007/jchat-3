import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'messages',
  title: 'Messages, friends and notifications',
  summary: 'How to write privately, follow other people, accept requests and check your notifications.',
  goal: 'You will message someone privately, manage your followers and know where to see your alerts.',
  sections: [
    {
      id: 'inbox',
      title: 'The Messages tab',
      blocks: [
        {
          type: 'p',
          text: 'Tap **Messages** in the bar at the bottom. The screen has two parts:',
        },
        {
          type: 'list',
          items: [
            '**Private messages**: your one-to-one conversations. If you have unread messages, you will see how many with a **new** label.',
            '**Notifications**: the app’s alerts, such as new followers, messages, reactions to your posts, orders and reservations.',
          ],
        },
        {
          type: 'note',
          kind: 'tip',
          text: 'If you have no conversations yet, the app says **No conversations yet** and that you can start a chat from someone’s profile.',
        },
      ],
    },
    {
      id: 'send-dm',
      title: 'Message someone privately',
      blocks: [
        {
          type: 'steps',
          items: [
            'Open the person’s profile and tap **Message**. In a venue chat you can also tap their photo and then **DM**.',
            'Type in the **Message…** field and tap the send button.',
            'To send a photo, tap the photo button, choose **Take photo** or **Choose from gallery** and allow access if the app asks.',
            'To send a voice note, tap the microphone, speak and tap the send button.',
          ],
        },
        {
          type: 'note',
          kind: 'important',
          text: 'You cannot always write to someone. Each person decides who can send them direct messages. If it does not let you, the app says **This user doesn\'t accept direct messages.**, **You need to follow this user to message them.** or **You can\'t message this user.**',
        },
        {
          type: 'list',
          items: [
            'Photos in direct messages are reviewed. The sender sees **In review**; the receiver sees **Reviewing photo…**, until it is approved.',
            'A photo that may be sensitive appears blurred with **Sensitive photo**. Tap **View anyway** to see it or **Report** to let us know.',
            'GIFs cannot be sent in messages: the app shows **GIF not allowed**.',
          ],
        },
        {
          type: 'p',
          text: 'To decide who can write to you, see [Profile and privacy](/help/users/profile-and-privacy#privacy).',
        },
      ],
    },
    {
      id: 'friends',
      title: 'Follow and accept requests',
      blocks: [
        {
          type: 'p',
          text: 'On JChat you follow other people and they follow you. If an account is private, your follow is a request the other person has to accept.',
        },
        {
          type: 'steps',
          items: [
            'Open the person’s profile, or tap their photo in a venue chat.',
            'Tap **Follow**. The button changes to **Following**; if the account is private, it changes to **Requested**.',
            'To unfollow, tap **Following** and confirm with **Unfollow**. To withdraw a request, tap **Requested** and confirm with **Cancel request**.',
          ],
        },
        { type: 'p', text: 'To see your lists and answer requests:' },
        {
          type: 'steps',
          items: [
            'Tap **Profile** and then **Edit Profile**.',
            'Under **Your network**, tap **Followers**, **Following** or **Requests**. The screen is called **Friends**.',
            'In **Requests**, tap **Accept** or **Decline** on each one.',
            'In **Followers**, **Remove** takes that person off your followers. In **Following**, **Unfollow** does what it says.',
          ],
        },
      ],
    },
    {
      id: 'manage-conversations',
      title: 'Delete, report and block',
      blocks: [
        {
          type: 'steps',
          items: [
            'To delete a conversation, swipe its row in **Private messages** and tap **Delete**. The app asks **Delete conversation?**; confirm.',
            'To report or block the person, open the conversation and tap the three dots at the top. Choose **Report user** or **Block** that person.',
            'To report a single message, press and hold the other person’s message.',
          ],
        },
        {
          type: 'note',
          kind: 'important',
          text: 'Deleting a conversation only removes it from your inbox: the other person still sees it.',
        },
        {
          type: 'p',
          text: 'The report reasons and what happens next are in [Safety](/help/users/safety#reporting). To see or undo your blocks, see [Safety](/help/users/safety#blocking).',
        },
      ],
    },
    {
      id: 'notifications',
      title: 'Notifications',
      blocks: [
        {
          type: 'p',
          text: 'Alerts appear in **Notifications**, below your private messages. They also reach you as phone notifications if you allowed notifications. If you are in a venue chat, the bell at the top opens them.',
        },
        {
          type: 'steps',
          items: [
            'Tap an alert to go straight to what changed, for example an order or a message.',
            'To remove an alert, swipe its row and tap **Delete**.',
          ],
        },
        {
          type: 'list',
          items: [
            'If you have an order in progress, you will see it at the top of the list with **In progress**. Tap it to open its tracking.',
            'To turn off social alerts (followers, reactions and messages) or change what the lock screen shows, see [Profile and privacy](/help/users/profile-and-privacy#settings).',
            'If they do not reach you, see [Troubleshooting](/help/users/troubleshooting#notifications).',
          ],
        },
      ],
    },
  ],
};

export default chapter;
