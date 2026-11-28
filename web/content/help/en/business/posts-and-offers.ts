import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'posts-and-offers',
  title: 'Posts and offers',
  summary: 'Share news with photos and create offers your customers see in the app.',
  goal: 'You will publish news and offers from your venue so nearby users can see them.',
  sections: [
    {
      id: 'where-they-show',
      title: 'Where they show up',
      blocks: [
        {
          type: 'p',
          text: 'Your posts and your offers appear on the **Business offers** screen of the app (the centre button of the bottom bar). Each user chooses the distance radius within which they want to see news.',
        },
        {
          type: 'p',
          text: 'Offers can also appear as a card inside your venue\'s chat room.',
        },
        {
          type: 'note',
          kind: 'important',
          text: 'Only verified venues are shown. You can create posts and offers beforehand, but users will see them once your venue is verified. See how to get verified in [Register your business](/help/business/register-your-business).',
        },
        {
          type: 'p',
          text: 'Both tools are in the web dashboard, in the **Menu** group: **Posts** and **Offers**.',
        },
      ],
    },
    {
      id: 'create-post',
      title: 'Create a post',
      blocks: [
        {
          type: 'steps',
          items: [
            'In the dashboard, open **Posts**.',
            'Press **New post**.',
            'In **Text**, write what you want to share (up to 1000 characters).',
            'Press **Add photos** and choose up to 4. They must be JPG, PNG or WebP, up to 10 MB each.',
            'Check the **This is how it will look in the app** preview and, to drop a photo, press **Remove photo**.',
            'Press **Publish**. You will see **Post published.**',
          ],
        },
        {
          type: 'note',
          kind: 'important',
          text: 'You need text or at least one photo. Otherwise you will see **Add some text or at least one photo.**',
        },
      ],
    },
    {
      id: 'manage-posts',
      title: 'Edit or delete a post',
      blocks: [
        {
          type: 'p',
          text: 'Your posts stay until you delete them. On each one you see how many **Likes** and **Comments** it has.',
        },
        {
          type: 'steps',
          items: [
            'In **Posts**, find the one you want to change.',
            'Press **Edit**, make your changes and press **Save changes**.',
            'To remove it, press **Delete** and confirm. This can\'t be undone.',
          ],
        },
      ],
    },
    {
      id: 'create-offer',
      title: 'Create an offer',
      blocks: [
        {
          type: 'steps',
          items: [
            'In the dashboard, open **Offers**.',
            'Press **New Offer**.',
            'Under **Offer type**, choose one: **Happy Hour**, **BOGO**, **Discount Code**, **Flash Sale** or **Bundle**.',
            'Type the **Offer title**, for example "Happy Hour — 2-for-1 cocktails". It is required.',
            'If you like, fill in the **Discount value** (for example "20%"), the **Min. purchase ($)** and the **Description**.',
            'If you chose **Discount Code**, type the **Promo code**.',
            'Under **Publish to chat room**, choose the room where you want the offer card to appear, or leave it blank.',
            'If you like, set the start and end date and time. If you set no start, the offer begins as soon as you create it.',
            'Press **Create Offer**.',
          ],
        },
        {
          type: 'note',
          kind: 'important',
          text: 'The chat card is posted when you create the offer only if it starts right then and you chose a room. If you set a future start, the offer is saved as **Scheduled** and the card does not appear in the chat by itself.',
        },
      ],
    },
    {
      id: 'manage-offers',
      title: 'Pause or resume an offer',
      blocks: [
        {
          type: 'p',
          text: 'Each offer shows its status: **Active**, **Scheduled**, **Paused** or **Ended**.',
        },
        {
          type: 'steps',
          items: [
            'In **Offers**, find the offer.',
            'Press **Pause** to stop it, or **Resume** to turn it on again.',
          ],
        },
        {
          type: 'note',
          kind: 'tip',
          text: 'Give limited-time offers, like Happy Hour, an end date so you do not have to remember to remove them.',
        },
      ],
    },
  ],
};

export default chapter;
