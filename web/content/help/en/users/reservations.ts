import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'reservations',
  title: 'Book a table',
  summary: 'How to book from a venue card, what each status means and how to cancel.',
  goal: 'You will book a table at a venue, follow its status and cancel it if your plans change.',
  sections: [
    {
      id: 'make-a-reservation',
      title: 'Make a reservation',
      blocks: [
        { type: 'p', text: `You only pick: there is nothing to type. A reservation is a request: the venue confirms it afterwards.` },
        {
          type: 'image',
          src: '/help/users/reservations/reserve-day-en.webp',
          alt: 'The first step to book a table: choose the day from the next days or More dates.',
          platform: 'ios',
          width: 780,
          height: 1696,
        },
        {
          type: 'steps',
          items: [
            `Open the **Map** tab and tap the venue where you want to book.`,
            `On the venue card, tap **Reserve**.`,
            `Step **Which day?**: pick a day from the 14-day strip. To go further, tap **More dates** and pick from the calendar (up to 60 days). Days when the venue does not take reservations can't be picked.`,
            `Step **What time?**: pick a time. Times are 30 minutes apart and are the venue's local times. Times marked **Waitlist** are fully booked, but you can still join the waitlist.`,
            `Step **How many people?**: pick 1 to 8. Tap **9+** for a bigger group (up to 20).`,
            `Step **Any requests? (optional)**: pick any you like (for example **Birthday**, **Terrace** or **Allergies**) or none, then tap **Continue**.`,
            `On **Review your reservation**, check the details. If something is wrong, tap **Change** next to it.`,
            `Tap **Confirm reservation**. If you picked a full time, the button says **Join the waitlist**.`,
          ],
        },
        { type: 'note', kind: 'important', text: `If you pick **Allergies**, the app reminds you: tell the venue when you arrive.` },
      ],
    },
    {
      id: 'times-and-clock',
      title: 'How the time is shown',
      blocks: [
        { type: 'p', text: `A reservation time is always the venue's local time. In Spanish it is shown on a 24-hour clock (for example, 19:00). In English it is shown on a 12-hour clock (for example, 7:00 PM).` },
        { type: 'p', text: `Change the app language in **Settings** → **Language**. It is explained in [Profile and privacy](/help/users/profile-and-privacy).` },
      ],
    },
    {
      id: 'status',
      title: 'What each status means',
      blocks: [
        { type: 'p', text: `Each reservation shows a label with its status:` },
        {
          type: 'list',
          items: [
            `**Pending confirmation**: you sent the request and the venue has not answered yet.`,
            `**Confirmed**: the venue accepted your reservation.`,
            `**Rejected**: the venue could not accept it. If it said why, you will see the reason: **No availability**, **Closed that day** or **Group too large**.`,
            `**Cancelled**: the reservation was cancelled.`,
            `**No response from the venue**: the time has passed and the venue never answered.`,
            `**Arrived** and **No-show**: the venue sets these after the time.`,
            `**Waitlist**: an extra label on reservations you made for a full time.`,
          ],
        },
        { type: 'p', text: `When the venue confirms or rejects your request, you get a notification.` },
      ],
    },
    {
      id: 'my-reservations',
      title: 'See your reservations',
      blocks: [
        {
          type: 'steps',
          items: [
            `Tap the **Profile** tab.`,
            `Tap the settings icon.`,
            `Tap **My reservations**.`,
          ],
        },
        {
          type: 'image',
          src: '/help/users/reservations/my-reservations-en.webp',
          alt: 'The My reservations screen with past reservations and their status.',
          platform: 'ios',
          width: 780,
          height: 1696,
        },
        { type: 'p', text: `The list has two parts: **Upcoming** and **Past**. At the top you will see **Your next reservation** with the key details. That card also shows at the top of the **Nearby** tab while you have a pending or confirmed reservation.` },
        { type: 'p', text: `The card has four buttons: **Directions** (opens your phone's maps app), **Add to calendar**, **View venue** and **Cancel**.` },
        { type: 'note', kind: 'tip', text: `After booking, tap **View my reservations** on the confirmation screen to go straight to the list.` },
      ],
    },
    {
      id: 'calendar-and-reminders',
      title: 'Calendar and reminders',
      blocks: [
        {
          type: 'steps',
          items: [
            `In **My reservations** or on the **Your next reservation** card, tap **Add to calendar**.`,
            `Check the event that opens and save it to your calendar.`,
          ],
        },
        { type: 'p', text: `The button only shows on pending or confirmed reservations that have not happened yet. On Android the calendar editor opens directly. On iPhone with iOS 17 or newer it does too; on older iOS versions the app asks for permission the first time. If you said no, you will see: Allow calendar access in Settings to add the reservation.` },
        { type: 'p', text: `If your reservation is pending or confirmed, you may also get a notice the day before (**Tomorrow at…**) and another 2 hours before (**In 2 hours…**).` },
      ],
    },
    {
      id: 'cancel',
      title: 'Cancel a reservation',
      blocks: [
        {
          type: 'steps',
          items: [
            `Open **My reservations** or the **Your next reservation** card.`,
            `Tap **Cancel reservation** (on the card, **Cancel**).`,
            `On **Cancel reservation?**, tap **Cancel reservation** to confirm. If you change your mind, tap **Keep it**.`,
            `You will see **Reservation cancelled** and the status changes to **Cancelled**.`,
          ],
        },
        { type: 'note', kind: 'important', text: `You can only cancel pending or confirmed reservations that have not happened yet. The app does not let you edit a reservation: if you need another date or time, cancel and make a new one.` },
      ],
    },
  ],
};

export default chapter;
