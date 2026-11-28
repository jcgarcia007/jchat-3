import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'profile-and-privacy',
  title: 'Profile, posts and privacy',
  summary: 'Edit your profile, post photos, decide who sees you and set language, appearance, notifications and the app lock.',
  goal: 'You will set up your profile and your privacy the way you want them.',
  sections: [
    {
      id: 'your-profile',
      title: 'Your profile',
      blocks: [
        { type: 'p', text: `Your profile is in the **Profile** tab. There you see your posts and your network (followers, following and requests).` },
        {
          type: 'steps',
          items: [
            `Tap the **Profile** tab.`,
            `Tap **Edit Profile**.`,
            `To change your photo, tap the avatar and pick an image from your library.`,
            `Change what you like: **Display Name**, **Username**, **Bio** and **City**.`,
            `If you want, tap **Choose Theme** to change the **Profile Theme**.`,
            `Tap **Save**.`,
          ],
        },
        { type: 'note', kind: 'important', text: `The **Username** is 3 to 30 characters: lowercase letters, numbers and underscores. The app tells you if it is free (**Username available**) or already used (**Username already taken**). In **City** you type the text yourself: JChat never uses your location to fill it in.` },
      ],
    },
    {
      id: 'posts',
      title: 'Post photos',
      blocks: [
        {
          type: 'steps',
          items: [
            `On your profile, tap **Post**.`,
            `Tap **Gallery** or **Camera** to add photos. You can attach up to 4. The first time, the app asks for access to your photos or the camera.`,
            `Write a description in **Write a caption…** (up to 2200 characters).`,
            `If you want, type a place in **Location**. It is only text you type: the location is never detected automatically.`,
            `Tap **Post**.`,
          ],
        },
        {
          type: 'steps',
          items: [
            `To delete a post of yours, open it from your profile.`,
            `Open the post's actions menu and tap **Delete**.`,
            `On **Delete post?**, confirm with **Delete**.`,
          ],
        },
        { type: 'note', kind: 'important', text: `When you delete a post, the post and its photos are deleted for good.` },
      ],
    },
    {
      id: 'privacy',
      title: 'Who sees you',
      blocks: [
        { type: 'p', text: `All of this is in **Settings** → **Privacy Settings**. On that screen the app reminds you that your real-time location is never shared and that this cannot be changed.` },
        {
          type: 'steps',
          items: [
            `Tap the **Profile** tab and then the settings icon.`,
            `Tap **Privacy Settings**.`,
            `Under **Account visibility**, pick **Public** or **Private**.`,
          ],
        },
        { type: 'p', text: `With a private account, anyone who wants to see your posts has to follow you and you receive **Requests**. People who don't follow you see **This account is private**.` },
        {
          type: 'list',
          items: [
            `**Who sees my posts** and **Who sees my stories**: choose **Everyone**, **Followers** or **Only me**.`,
            `**Who can DM me**: choose **Everyone**, **Followers** or **Nobody**.`,
            `**Who can mention me (@)**: choose who can mention you.`,
            `**Read receipts**: let others see, or not, when you have read their messages.`,
            `**Active status** and **Offline mode**: show or hide when you were last active.`,
            `**City of residence**: decide whether your city shows on your profile.`,
            `**Blocked users**: the list of people you blocked (see [Safety](/help/users/safety)).`,
          ],
        },
      ],
    },
    {
      id: 'settings',
      title: 'Language, appearance and notifications',
      blocks: [
        { type: 'p', text: `Open it with the **Profile** tab and the settings icon. The screen is called **Settings**.` },
        {
          type: 'steps',
          items: [
            `Under **Language**, pick **English** or **Español**. The app changes right away.`,
            `Under **Appearance** → **Theme**, pick **Dark**, **Light** or **System** (follows your phone's setting).`,
            `Under **Notifications**, turn **Social** (follows, reactions, messages) on or off.`,
            `Under **Message preview**, pick what the lock screen shows: **Full**, **Name only** or **Discreet**.`,
          ],
        },
        { type: 'note', kind: 'tip', text: `With **Discreet**, the notification only says You have something new on JChat. The name JChat is always visible on the notification.` },
      ],
    },
    {
      id: 'security',
      title: 'App lock and password',
      blocks: [
        { type: 'p', text: `You can ask for your fingerprint or face when the app opens and before paying.` },
        {
          type: 'steps',
          items: [
            `Open **Settings** and scroll to **Privacy & Security**.`,
            `On iPhone, turn on **Use Face ID / fingerprint**. On Android, turn on **Use fingerprint or face recognition**.`,
          ],
        },
        { type: 'note', kind: 'important', text: `If the switch is off and greyed out, your phone has no fingerprint or face recognition set up. On iPhone, set up Face ID or Touch ID in your phone's settings. On Android, set up a fingerprint or face recognition. Then come back.` },
        {
          type: 'steps',
          items: [
            `To change your password, open **Settings** and tap **Change Password**.`,
            `Type **Current password**, **New password** (at least 8 characters) and **Confirm new password**.`,
            `Tap **Save Password**.`,
          ],
        },
        { type: 'p', text: `To leave your account, tap **Sign Out** in **Settings** and confirm. If you want to delete your account, see [Delete your account](/help/users/delete-account).` },
      ],
    },
  ],
};

export default chapter;
