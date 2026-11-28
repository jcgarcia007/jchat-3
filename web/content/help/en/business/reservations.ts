import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'reservations',
  title: 'Reservations',
  summary: 'Set your hours, answer table requests and add phone bookings.',
  goal: 'You will receive reservation requests, confirm or reject them and keep track of who arrives.',
  sections: [
    {
      id: 'how-it-works',
      title: 'How reservations work',
      blocks: [
        {
          type: 'p',
          text: 'Customers ask for a table in the app: they pick the day, the time and how many people. Each request reaches your dashboard as **Pending** and the customer waits for your answer.',
        },
        {
          type: 'p',
          text: 'The times offered come from your operating hours: every 30 minutes, from opening to closing, up to 60 days ahead. Days you mark as closed do not take reservations.',
        },
        {
          type: 'p',
          text: 'Reservations live in the web dashboard, in the **Orders** group, under **Reservations**. Times are shown in 24-hour format in Spanish and in 12-hour format in English.',
        },
      ],
    },
    {
      id: 'set-hours',
      title: 'Set the hours when you take reservations',
      blocks: [
        {
          type: 'steps',
          items: [
            'In the dashboard, open **Configuration** (the gear at the bottom of the side menu).',
            'Find the **Operating Hours** section.',
            'For each day, choose the opening and closing time, or turn on **Closed** if you do not open that day.',
            'If your hours are the same every day, use the **Copy to all days** button on one row.',
            'Press **Save Hours**.',
          ],
        },
        {
          type: 'note',
          kind: 'tip',
          text: 'If you close after midnight, the dashboard reminds you with the note **Closes the next day**.',
        },
        {
          type: 'note',
          kind: 'important',
          text: 'Changing your hours does not change requests you already have. Check your **Reservations** list in case one falls on a day you no longer open.',
        },
      ],
    },
    {
      id: 'answer-requests',
      title: 'Confirm or reject a request',
      blocks: [
        {
          type: 'p',
          text: 'The number of unanswered requests shows on the **Pending** tab and on the **Reservations** menu item. You can see reservations as a **Calendar** or a **List**, and filter them by status: **All**, **Confirmed**, **Arrived**, **No-show**, **Cancelled**, **Rejected** or **No response**.',
        },
        {
          type: 'steps',
          items: [
            'In **Reservations**, find the **Pending** request. You will see the date, the time, the number of people and the customer\'s requests (for example, terrace or birthday).',
            'To accept it, press **Confirm**. You will see **Reservation confirmed. The guest was notified.**',
            'To decline it, press **Reject**.',
            'If you like, choose a reason: **No availability**, **Closed that day** or **Group too large**. It is optional and the customer will see it.',
            'Press **Reject reservation**. If you change your mind, press **Keep it**.',
          ],
        },
        {
          type: 'note',
          kind: 'important',
          text: 'A reservation that is already **Confirmed** can still be rejected if something changes. The customer is notified of the change.',
        },
        {
          type: 'p',
          text: 'If the customer picked **Allergies (tell the venue on arrival)**, you will see it on the request. Be ready for them to remind you when they arrive.',
        },
      ],
    },
    {
      id: 'manual-and-arrival',
      title: 'Add and edit reservations, and mark arrivals',
      blocks: [
        {
          type: 'steps',
          items: [
            'To write down a booking someone makes by phone, press **New Reservation**.',
            'Type the **Phone**. If the customer already exists you will see **Customer found — details auto-populated**; if not, fill in **First Name** and **Last Name**.',
            'Choose the **Date & Time** and the **Party Size**.',
            'If you like, choose the **Tables** (optional, you can assign them later). You can also fill in **Event Type** and **Special Requests (optional)**.',
            'Press **Confirm Reservation**.',
          ],
        },
        {
          type: 'p',
          text: 'To change a reservation, press **Edit** on its row and then **Save changes**. From there you can also mark **No-show** for someone who did not turn up, or press **Cancel reservation**.',
        },
        {
          type: 'steps',
          items: [
            'When the customer arrives, press **Check-in** on their reservation.',
            'Assign a table. You cannot confirm the arrival without one.',
            'Press **Confirm arrival**. The reservation changes to **Arrived**.',
          ],
        },
      ],
    },
    {
      id: 'no-answer',
      title: 'If you do not answer in time',
      blocks: [
        {
          type: 'p',
          text: 'If the time of a **Pending** request passes and nobody answered, it shows in your dashboard as **No response** and can no longer be confirmed. About 2 hours after that time, the system closes it for good and frees any tables assigned to it. The customer is not notified.',
        },
        {
          type: 'note',
          kind: 'tip',
          text: 'Look at the **Pending** tab at the start of each shift so no request expires unanswered.',
        },
      ],
    },
    {
      id: 'notices',
      title: 'Which notifications you get and which the customer gets',
      blocks: [
        {
          type: 'list',
          items: [
            'You get a notification on your phone when a new request arrives: "New request" with the number of guests, the date and the time.',
            'You get another one if the customer cancels: "Reservation cancelled", with their name, the date and the time. Check your list to free the table if you had assigned one.',
            'The customer gets a notification when you confirm ("Reservation confirmed") or reject ("Reservation not accepted"), and a reminder before the reservation.',
          ],
        },
      ],
    },
  ],
};

export default chapter;
