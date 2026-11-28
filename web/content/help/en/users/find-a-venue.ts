import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'find-a-venue',
  title: 'Find a venue',
  summary: 'Use the map, the Nearby list, search and filters to find venues and see their card and offers.',
  goal: 'You will find a venue near you and know what you can do from its card.',
  sections: [
    {
      id: 'map',
      title: 'The map',
      blocks: [
        {
          type: 'p',
          text: 'The bar at the bottom has four tabs (**Map**, **Nearby**, **Messages** and **Profile**) and a button in the middle, **Offers**. The map is the first tab.',
        },
        {
          type: 'steps',
          items: [
            'Tap **Map**.',
            'The first time, the app explains why it uses your location. Tap **Continue** and allow location in your phone’s prompt.',
            'Move the map with your finger. Use the zoom buttons, or the center-on-my-location button, to get back to where you are.',
            'To change how the map looks, tap the map style button and choose **Normal** or **Satellite**.',
            'Tap a pin to open that venue’s card.',
          ],
        },
        {
          type: 'list',
          items: [
            'Each pin shows the venue name and, if there are people inside, how many.',
            'A closed venue looks grey and its pin says **closed**.',
          ],
        },
        {
          type: 'note',
          kind: 'important',
          text: 'If you do not allow location, the map still works, but without distances or the radius filter. The app shows a notice with **Open Settings** so you can turn it on. If the places could not be loaded, tap **Tap to retry**.',
        },
      ],
    },
    {
      id: 'nearby-list',
      title: 'The Nearby list',
      blocks: [
        {
          type: 'p',
          text: 'If you prefer a list to a map, use the **Nearby** tab. Each venue is a card with its category, whether it is open or closed, how many rooms it has, how many people are there and the distance.',
        },
        {
          type: 'steps',
          items: [
            'Tap **Nearby**.',
            'To search by name, type in **Search venues…**.',
            'To see one kind of venue, tap a category. **All** removes the filter.',
            'Tap **Enter** on the venue card. You have to be inside the venue to enter the chat (see [Venue chat](/help/users/venue-chat)).',
            'To refresh the list, pull down.',
          ],
        },
        {
          type: 'note',
          kind: 'tip',
          text: 'If you see **No venues nearby** or **No results found**, try a different search or clear the category.',
        },
      ],
    },
    {
      id: 'search-and-filters',
      title: 'Search and filter on the map',
      blocks: [
        {
          type: 'steps',
          items: [
            'On the map, type the name or category in **Search places…**. A list of results appears below.',
            'Tap a result: the map centers on that venue and its card opens. **Cancel** clears the search.',
            'To see only one kind of venue, tap a category in the top row: **All**, **Open now**, **Restaurant**, **Café**, **Bar & Nightclub** and any others available.',
            'For more options, tap the advanced filters button. In **Filters** you can choose the **Distance** and turn on **Open now only**.',
            'Tap **Apply**. To see everything again, tap **Reset all** or **Reset**.',
          ],
        },
        {
          type: 'p',
          text: 'With location on, the map tells you how many places are near you. Distance is shown in kilometers or miles, depending on your phone’s region.',
        },
        {
          type: 'note',
          kind: 'important',
          text: 'The distance filter needs your location. Without it you will see **Turn on location to filter by distance.**',
        },
      ],
    },
    {
      id: 'venue-card',
      title: 'The venue card',
      blocks: [
        {
          type: 'p',
          text: 'The card opens when you tap a pin, a search result or **View venue** on the offers tab. It shows the photos, the description, the address and distance, the rating, the opening hours and how many people are active.',
        },
        {
          type: 'list',
          items: [
            '**Enter Chat**: opens the venue chat. It only works when you are inside the venue.',
            '**Directions**: opens your maps app with the route to the venue.',
            '**Menu**: opens the venue menu (see [Order and pay](/help/users/order-and-pay)).',
            '**Offers**: takes you to the offers from nearby businesses.',
            '**Reserve**: opens the form to book a table (see [Reservations](/help/users/reservations)).',
            '**Show more** and **See hours**: expand the full description and each day’s hours.',
            'The share button sends the venue link to whoever you choose.',
          ],
        },
        {
          type: 'note',
          kind: 'important',
          text: 'If you are far away, the **Enter Chat** button is disabled and the card tells you how far you are. You can only enter the chat when you are inside the venue.',
        },
        {
          type: 'note',
          kind: 'tip',
          text: 'If the venue is closed, the card shows **Closed now** and when it opens. You can enter the chat, but orders open when the venue opens.',
        },
      ],
    },
    {
      id: 'offers',
      title: 'Offers from businesses',
      blocks: [
        {
          type: 'p',
          text: 'The button in the middle of the bar, **Offers**, shows offers and posts from nearby businesses. Each offer can come with an end date and a code.',
        },
        {
          type: 'steps',
          items: [
            'Tap **Offers**.',
            'Scroll the list. To see the venue behind an offer, tap **View venue**.',
            'To look farther or closer, tap the radius button and choose a radius. The app remembers it.',
            'To go back, tap the back arrow.',
          ],
        },
        {
          type: 'note',
          kind: 'tip',
          text: 'If you see **No offers right now**, there are no offers from verified businesses yet. If you see that nothing is new within your radius, try a larger one.',
        },
      ],
    },
  ],
};

export default chapter;
