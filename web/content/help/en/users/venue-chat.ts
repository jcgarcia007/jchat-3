import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'venue-chat',
  title: 'Venue chat',
  summary: 'How to enter a venue chat while you are there, write, send photos and voice notes, and leave.',
  goal: 'You will enter the chat of the venue you are in, use it with peace of mind and leave whenever you want.',
  sections: [
    {
      id: 'enter-the-chat',
      title: 'Enter the venue chat',
      blocks: [
        {
          type: 'p',
          text: 'A venue chat is for the people who are at the venue right now. That is why the app checks your location when you enter: so nobody from outside joins. It uses your location only while the app is open.',
        },
        {
          type: 'steps',
          items: [
            'Pick the venue. On **Map**, tap its pin and then **Enter Chat**. On **Nearby**, tap **Enter** on its card. You can also scan the venue’s QR, or your table’s, with your phone camera, if it has one.',
            'If the app asks, sign in. With a QR you will see **You\'re about to enter** and the venue name before you sign in.',
            'On the venue screen, read how your location is used and tap **Enter Room**. At some venues the button says **Enter the chat**.',
            'Allow location in your phone’s prompt.',
            'Wait while the app shows **Checking your location…**. If you are inside the venue, you are in the chat.',
          ],
        },
        {
          type: 'note',
          kind: 'important',
          text: 'If you are not inside the venue, the app tells you how far away you are and does not let you in. Get closer and tap **Retry**. In the meantime you can tap **View menu** to see the menu.',
        },
        {
          type: 'note',
          kind: 'tip',
          text: 'If you denied location, tap **Allow location**. If your phone will not ask again, the button is **Open Settings**: turn location on for JChat and come back; the app tries again.',
        },
      ],
    },
    {
      id: 'send-messages',
      title: 'Writing, photos and voice notes',
      blocks: [
        { type: 'p', text: 'To write a message:' },
        {
          type: 'steps',
          items: [
            'Tap the **Message…** field and type.',
            'Tap the send button.',
          ],
        },
        { type: 'p', text: 'To send a photo:' },
        {
          type: 'steps',
          items: [
            'Tap the camera button next to the message field.',
            'In **Send a photo**, choose **Camera** to take one now or **Gallery** to use one you already have.',
            'If it is the first time, allow access to the camera or photos.',
          ],
        },
        { type: 'p', text: 'To send a voice note:' },
        {
          type: 'steps',
          items: [
            'With the message field empty, tap the microphone button. If it is the first time, allow the microphone.',
            'Speak. The app shows how long you have been recording.',
            'Tap the button to send the voice message, or the one to cancel the recording if you do not want to send it.',
          ],
        },
        {
          type: 'note',
          kind: 'important',
          text: 'If your message has language JChat does not allow, the app shows **Message not sent**. Rewrite it with respect. If the venue muted you, you will see **You\'re muted** and you will not be able to write in that room.',
        },
      ],
    },
    {
      id: 'rooms-and-pins',
      title: 'Rooms, pinned messages and help from the venue',
      blocks: [
        {
          type: 'p',
          text: 'At the top of the chat you see how many people are in the room and their photos. If the venue has more than one room, they appear as tabs; tap one to switch rooms.',
        },
        {
          type: 'list',
          items: [
            'A tab with a padlock is a password-protected room. Tap it, type the **Room password** and tap **Enter room**. If you get it wrong several times, the app asks you to wait a while.',
            'When the venue pins a message, it appears in a strip above the chat. Tap it to see all the **Pinned Messages**.',
            'The **+** button in the bottom bar opens a panel with **Photo**, **Menu** and **Service**.',
            'The bell opens your notifications.',
          ],
        },
        { type: 'p', text: 'To call the waiter or ask the venue for help:' },
        {
          type: 'steps',
          items: [
            'Tap the **+** button and then **Service**. You can also tap the three dots at the top and choose **Ask the venue for help**.',
            'If you want, type your table or location and a note for the waiter.',
            'Tap **Call the waiter**.',
          ],
        },
        {
          type: 'note',
          kind: 'tip',
          text: 'If you called a moment ago, the app asks you to wait a few minutes before calling again. To order food or drinks, see [Order and pay](/help/users/order-and-pay).',
        },
      ],
    },
    {
      id: 'people-and-safety',
      title: 'Other people, reporting and blocking',
      blocks: [
        {
          type: 'steps',
          items: [
            'Tap someone’s photo, at the top or next to their message. A card opens with **Profile**, **DM**, **Follow**, **Report** and **Block**.',
            'To act on one specific message, press and hold another person’s message and choose **Report message** or **Block** that person.',
            'If you report, pick a reason and tap **Send report**.',
          ],
        },
        {
          type: 'p',
          text: 'When you block someone you stop seeing their messages. To see the report reasons and what happens next, see [Safety](/help/users/safety#reporting). To write to someone privately, see [Messages](/help/users/messages).',
        },
      ],
    },
    {
      id: 'messages-expire',
      title: 'Messages are deleted after 24 hours',
      blocks: [
        {
          type: 'p',
          text: 'Messages in a venue chat are deleted 24 hours after they are sent. This applies to yours and to everyone else’s. The app tells you when you enter the chat: “Messages in this chat are deleted after 24 hours, except pinned ones or those under review because of a report”. The **More options** sheet shows a reminder of this rule.',
        },
        {
          type: 'list',
          items: [
            'Deletion runs every few minutes, so a message can stay visible a little longer than expected.',
            'A message the venue has pinned is kept for as long as it stays pinned.',
            'Photos you sent to the room are deleted together with their message.',
            'A message that is under review because of a report may be kept longer, with its photo if it has one.',
          ],
        },
        {
          type: 'note',
          kind: 'important',
          text: 'This rule is only for the venue chat. Direct messages are something else: they are explained in [Messages](/help/users/messages).',
        },
      ],
    },
    {
      id: 'leave',
      title: 'Leave the venue',
      blocks: [
        {
          type: 'steps',
          items: [
            'In the chat, tap the three-dots button (**More options**).',
            'Tap **Leave the venue**.',
            'The app asks if you want to leave. Tap **Leave the venue** to confirm or **Cancel** to stay.',
          ],
        },
        {
          type: 'p',
          text: 'The back arrow only takes you off the screen: you are still at the venue. From the other tabs you will see a bar with **Back to chat** and **Leave**.',
        },
        {
          type: 'note',
          kind: 'important',
          text: 'When you leave, the venue conversation is lost. To come back you have to scan the venue’s QR or be inside it.',
        },
        {
          type: 'p',
          text: 'While the chat is open, the app checks from time to time that you are still at the venue. If you leave the venue, it can take you out of the chat and tell you that you are outside the venue’s area. It does not follow your location when the app is closed.',
        },
      ],
    },
  ],
};

export default chapter;
