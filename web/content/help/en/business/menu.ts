import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'menu',
  title: 'Your menu',
  summary: 'Create categories and products, choose how your menu looks and share its public link.',
  goal: 'Build your menu, decide how your customers see it and share its link.',
  sections: [
    {
      id: 'menu-mode',
      title: 'Choose your menu mode',
      blocks: [
        { type: 'p', text: 'In the dashboard, open **Menu** > **Menu**: the **Menu Editor** opens. Under **Menu mode** you choose how to show your menu to customers in the web hub.' },
        {
          type: 'list',
          items: [
            '**Create my Web Menu (template)**: create your own interactive menu with JChat\'s editor (categories, products, prices).',
            '**I have my own menu (link)**: paste the link to your existing menu (PDF, Linktree, Google Docs, etc.).',
          ],
        },
        {
          type: 'steps',
          items: [
            'Under **Menu mode**, choose one of the two options.',
            'If you chose **I have my own menu (link)**, paste the address, which must start with http:// or https://, and press **Save**.',
            'You will see **Menu mode saved.** and, next to **Current status:**, how your menu stands.',
          ],
        },
        { type: 'note', kind: 'tip', text: 'With **Remove menu (show nothing)** you stop showing your menu. The **Menu template**, **Color Palette** and **Card effect** sections only appear with **Create my Web Menu (template)**.' },
      ],
    },
    {
      id: 'categories',
      title: 'Create your categories',
      blocks: [
        {
          type: 'steps',
          items: [
            'Under **Menu categories**, press **New category**.',
            'Enter the **Category name** (it is required).',
            'Pick an image under **Icon**, or upload your own image in the **Photo** tab.',
            'Press **Save**.',
          ],
        },
        { type: 'p', text: 'Each category has buttons with these names:' },
        {
          type: 'list',
          items: [
            '**Move category up** and **Move category down**: change its order.',
            '**Edit category**: change its name, icon or photo.',
            '**Hide category** and **Show category**: remove it from your menu or bring it back without deleting it.',
            '**Delete category**: removes it.',
          ],
        },
        { type: 'note', kind: 'important', text: 'Deleting a category also deletes all its products. JChat asks you first: **Delete category "…"? This will also remove all its products.**' },
        { type: 'note', kind: 'tip', text: 'On the Pro plan, the **AI Assistant** button suggests categories and products. Nothing is published until you decide.' },
      ],
    },
    {
      id: 'products',
      title: 'Add products',
      blocks: [
        {
          type: 'steps',
          items: [
            'In the category, press **Add product**.',
            'Enter the **Product name** and the **Base price (USD)**. Both are required.',
            'Write a short **Description**, with ingredients or preparation style.',
            'Press **Save Product**.',
          ],
        },
        { type: 'p', text: 'Each product has buttons with these names:' },
        {
          type: 'list',
          items: [
            '**Edit product**: change its details.',
            '**Hide from menu** and **Show on menu**: remove it or bring it back without deleting it.',
            '**Delete product**: removes it.',
          ],
        },
        { type: 'note', kind: 'tip', text: 'In **Unit cost (USD)** you can note what the product costs you. It is private: it is never shown on your public menu.' },
      ],
    },
    {
      id: 'photos-and-options',
      title: 'Photos, tags and options',
      blocks: [
        {
          type: 'steps',
          items: [
            'In the product, scroll to **Product photos** and press **Add photos (jpeg, png, webp · max 5 MB)**.',
            'Choose your images. The **Primary** badge marks the product\'s main photo.',
            'If you like, tick the **Dietary tags** that apply and choose a **Badge**.',
            'Under **Option groups**, press **New group** to offer something the customer chooses, like a size or an extra.',
            'Enter the **Group name** (for example, Size) and choose whether it is **Single** (pick one) or **Multiple**. With **Min:** and **Max:** you limit how many options can be chosen; the group is **required** when the minimum is above zero.',
            'Press **Add option**, enter its name and, if it costs more, its extra price.',
            'Press **Save Product**.',
          ],
        },
        {
          type: 'list',
          items: [
            'Dietary tags: **Vegan**, **Vegetarian**, **Gluten Free**, **Dairy Free**, **Nut Free**, **Spicy** and **Seafood**.',
            'Badges: **None**, **New**, **Hot** and **Best Seller**.',
            '**Stock count**: leave it blank for unlimited stock. When it reaches 0, the product is hidden automatically.',
            '**Name (alt language)** and **Description (alt language)**: to write the product in a second language.',
          ],
        },
        { type: 'note', kind: 'tip', text: 'If you already created an option group on another product, use **Reuse group from business** so you do not type it again. On the Pro plan, the **→ EN** or **→ ES** button translates the description with AI.' },
      ],
    },
    {
      id: 'look-and-feel',
      title: 'Template, colors and effect',
      blocks: [
        { type: 'p', text: 'With **Create my Web Menu (template)** on, the editor shows you three collapsible sections. Each one saves as soon as you choose.' },
        {
          type: 'steps',
          items: [
            'Open **Menu template** and tap the one you like. You will see **Template saved.** and the **✓ Active** mark.',
            'Open **Color Palette** and pick one of the 40 palettes, or **Original template** to go back to its colors. The typography does not change.',
            'Open **Card effect** and choose the animation your customers will see when hovering over each dish.',
          ],
        },
        { type: 'note', kind: 'tip', text: 'On wide screens you see a phone preview of your menu on the right. To see the real result, use **View public menu →**.' },
      ],
    },
    {
      id: 'share-your-menu',
      title: 'Share your menu',
      blocks: [
        {
          type: 'steps',
          items: [
            'Under **Menu mode**, with **Create my Web Menu (template)** on, press **View my Web Menu ↗**.',
            'Your public menu opens. Copy the address from your browser bar to share it.',
            'Turn on **Show menu in chat** so customers see your menu icon in the venue chat.',
          ],
        },
        { type: 'note', kind: 'important', text: 'A hidden category or product does not appear for your customers. If a product runs out, you will see the **Out of stock** mark on its card.' },
      ],
    },
  ],
};

export default chapter;
