import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'safety',
  title: 'Safety: report and block',
  summary: 'How to report a person, a message or a post, how to block and what the community rules are.',
  goal: 'You will know how to report and block in the app and what we expect from everyone who uses JChat.',
  sections: [
    {
      id: 'community-rules',
      title: 'Community rules',
      blocks: [
        { type: 'p', text: `JChat is for people aged 18 or older who want to meet and talk at real places. Read the full rules in [Safety & Community Standards](/safety). These are not allowed:` },
        {
          type: 'list',
          items: [
            `Sexual content involving minors, or any attempt to contact or exploit a minor.`,
            `Harassment, threats, hate speech or discrimination.`,
            `Sexually explicit content, violence or illegal activity.`,
            `Spam, scams or impersonation.`,
          ],
        },
        { type: 'note', kind: 'important', text: `Accounts that break the rules are suspended or deleted. Serious cases may be reported to the authorities.` },
      ],
    },
    {
      id: 'reporting',
      title: 'Report',
      blocks: [
        { type: 'p', text: `You can report from several places in the app:` },
        {
          type: 'list',
          items: [
            `In a venue chat: press and hold another person's message and tap **Report message**. You can also tap the person and choose **Report**.`,
            `On a profile: open the profile menu and tap **Report**.`,
            `On a post: open the actions menu and tap **Report post**.`,
            `On a story: tap the report icon (**Report this story**).`,
            `In a direct message: open the chat menu and tap **Report user**, or press and hold a message you received and tap **Report message**.`,
          ],
        },
        {
          type: 'steps',
          items: [
            `Pick the reason: **Spam or scam**, **Harassment or bullying**, **Hate speech or discrimination**, **Threats or violence**, **Sexual content**, **Child safety — a minor is at risk**, **Impersonation**, **Copyright infringement** or **Other**.`,
            `Add details. They are optional, except for **Other**, where you must tell us what happened.`,
            `Tap **Send report**.`,
          ],
        },
        { type: 'note', kind: 'important', text: `If someone is in immediate danger, call 911. Don't wait for a report to be reviewed.` },
        { type: 'p', text: `You can't report your own content, and there is a daily limit on reports: if you reach it, the app tells you and you can try again tomorrow. After you send a report, the app tells you we will review it in 1–2 business days.` },
      ],
    },
    {
      id: 'blocking',
      title: 'Block',
      blocks: [
        { type: 'p', text: `When you block, the app explains: “Neither of you will see the other's profile, posts or messages, and you won't be able to follow or message each other. You can unblock anytime.” If you block from a venue chat, it adds: “This does not remove them from the room.”` },
        {
          type: 'steps',
          items: [
            `Open the person's menu: their profile, the venue chat or the direct chat.`,
            `Tap **Block** (in a direct chat: **Block** followed by the name).`,
            `Confirm with **Block**.`,
          ],
        },
        { type: 'note', kind: 'important', text: `Blocking does not take you out of a venue's room, nor remove the other person from it. Follows that were removed when you blocked are not restored when you unblock.` },
        {
          type: 'steps',
          items: [
            `To unblock, open **Settings** → **Privacy Settings** → **Blocked users**.`,
            `Tap **Unblock** next to the person and confirm.`,
          ],
        },
      ],
    },
    {
      id: 'more-help',
      title: 'More help',
      blocks: [
        { type: 'p', text: `You can also write to [safety@jchat.cloud](mailto:safety@jchat.cloud) with the username, what happened and, if you can, a screenshot. For other questions, write to [soporte@jchat.cloud](mailto:soporte@jchat.cloud).` },
        { type: 'p', text: `If you have trouble entering a chat or with notifications, see [Troubleshooting](/help/users/troubleshooting).` },
      ],
    },
  ],
};

export default chapter;
