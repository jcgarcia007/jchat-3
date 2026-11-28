import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'getting-started',
  title: 'Create your account and get started',
  summary: 'Sign up with email, Apple or Google, confirm your age and learn which permissions the app asks for.',
  goal: 'You will have your JChat account ready and know why the app asks for each permission.',
  sections: [
    {
      id: 'before-you-start',
      title: 'Before you start',
      blocks: [
        {
          type: 'p',
          text: 'JChat is an app for people aged 18 or older. You need an iPhone or an Android phone. If you sign up with email, use an address you can open on that same phone.',
        },
        {
          type: 'list',
          items: [
            'Your date of birth. We only use it to confirm your age: we keep just the year and it is not shown on your profile.',
            'A password of at least 8 characters, with a letter and a number (if you sign up with email).',
            'A username of 3 to 30 characters, with lowercase letters, numbers and underscores.',
          ],
        },
        {
          type: 'note',
          kind: 'important',
          text: 'If your date of birth does not meet the age requirement, the app shows **Not eligible** and you cannot create the account.',
        },
      ],
    },
    {
      id: 'create-account',
      title: 'Create your account with email',
      blocks: [
        {
          type: 'p',
          text: 'Sign-up has two steps. It starts on the welcome screen, which has the buttons **Get started** and **Log in**. Step 1 of 2:',
        },
        {
          type: 'steps',
          items: [
            'Tap **Get started**.',
            'Type your **Full name** and your **Email**.',
            'Type a **Password**. Below it you will see which rules you already meet: **At least 8 characters**, **At least one letter** and **At least one number**.',
            'Repeat the password in **Confirm password**.',
            'Tap **Continue**.',
          ],
        },
        { type: 'p', text: 'Step 2 of 2:' },
        {
          type: 'steps',
          items: [
            'Type your **Date of birth** in the day, month and year boxes. In English the month comes first; in Spanish, the day.',
            'Choose your **Language**: **English** or **Español**.',
            'Type your **Username**. If it is free you will see **Username is available!**; if not, **This username is already taken.**',
            'Tick the box to accept the [Terms of Service](/terms) and the [Privacy Policy](/privacy).',
            'Tap **Create my account**.',
          ],
        },
        {
          type: 'p',
          text: 'The app shows **Check your email**: we sent you a confirmation link. To activate your account:',
        },
        {
          type: 'steps',
          items: [
            'Open the confirmation email on this same phone.',
            'Tap the link.',
            'You will see **Email confirmed** and you will be signed in automatically.',
          ],
        },
        {
          type: 'note',
          kind: 'tip',
          text: 'If the link was already used or has expired, the app shows **Link expired**. Sign in to request a new one.',
        },
        {
          type: 'p',
          text: 'The first time you get in you see a few welcome screens. Tap **Next** to move on, **Skip** to skip them and, at the end, **Explore the map**.',
        },
      ],
    },
    {
      id: 'social-sign-in',
      title: 'Sign up with Apple or Google',
      blocks: [
        {
          type: 'p',
          text: 'You can create your account without typing a password, using your Apple or Google account.',
        },
        {
          type: 'steps',
          items: [
            'In step 1 (**Create account**), tap **Apple** or **Google**, below **or continue with**. You also find them when you tap **Log in** on the welcome screen.',
            'Allow access in the Apple or Google window.',
            'When the app asks you to confirm your age, follow the next section.',
          ],
        },
        {
          type: 'note',
          kind: 'tip',
          text: 'On iPhone, Apple uses its native button. On Android, Apple sign-in opens in a browser window.',
        },
      ],
    },
    {
      id: 'confirm-age',
      title: 'Confirm your age',
      blocks: [
        {
          type: 'p',
          text: 'If you sign in with Apple or Google, the app shows **Confirm your age** before letting you use it. The screen reminds you that JChat is only for people aged 18 or older, and that we only keep the year of your date of birth. It also appears if the app could not save your age when you signed up with email, for example because of a poor connection.',
        },
        {
          type: 'steps',
          items: [
            'Type your date of birth in the **Day**, **Month** and **Year** boxes. Numbers only.',
            'Tick the box to accept the Terms and the Privacy Policy.',
            'Tap **Continue**.',
            'When the app asks whether that is your date of birth, tap **Yes, continue**. If you made a mistake, tap **Edit**.',
          ],
        },
        {
          type: 'note',
          kind: 'important',
          text: 'If you do not meet the age requirement, the app shows **Not eligible** and the account you just created is deleted.',
        },
      ],
    },
    {
      id: 'sign-in',
      title: 'Sign in and reset your password',
      blocks: [
        {
          type: 'p',
          text: 'If you already have an account, you can sign in with email, Apple or Google. With email:',
        },
        {
          type: 'steps',
          items: [
            'On the welcome screen, tap **Log in**.',
            'Tap **Continue with email**.',
            'Type your email and your password.',
            'Tap **Sign in**.',
          ],
        },
        { type: 'p', text: 'If you forgot your password:' },
        {
          type: 'steps',
          items: [
            'On that same screen, tap **Forgot your password?**',
            'Type your email and tap **Send code**.',
            'Type the 6-digit code you received and tap **Verify**.',
            'Type your new password, repeat it and tap **Save Password**.',
          ],
        },
      ],
    },
    {
      id: 'permissions',
      title: 'Permissions the app asks for',
      blocks: [
        {
          type: 'p',
          text: 'The app asks for each permission when it needs it. You can say no: only the part that depends on that permission will stop working.',
        },
        {
          type: 'list',
          items: [
            '**Location**, only while you use the app: to show you what is nearby and to confirm you are inside a venue before letting you into its chat. JChat does not share your real-time location with other people.',
            '**Notifications**: to let you know about messages, followers, orders and reservations.',
            '**Camera**: to take photos for chat, posts and your profile.',
            '**Photos**: to choose images from your gallery for your profile, your posts and your messages.',
            '**Microphone**: to record voice messages.',
            '**Face ID or fingerprint** (optional): to unlock JChat when you open it and to confirm payments, only if you turn it on. On iPhone it is Face ID or Touch ID; on Android, your fingerprint or face recognition.',
          ],
        },
        {
          type: 'note',
          kind: 'important',
          text: 'Without location permission you can see the map, but you cannot enter a venue chat. The app shows **Open Settings** so you can turn it on.',
        },
        {
          type: 'note',
          kind: 'tip',
          text: 'To change a permission later, open your phone settings and look for JChat: on iPhone it is in the app list in **Settings**; on Android, in the app settings, under JChat permissions.',
        },
      ],
    },
  ],
};

export default chapter;
