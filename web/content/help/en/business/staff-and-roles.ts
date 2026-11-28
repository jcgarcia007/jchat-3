import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'staff-and-roles',
  title: 'Staff and roles',
  summary: 'Add your team, give each person a role and create your own roles with the permissions you choose.',
  goal: 'You will add employees to your venue, give them a role and decide what each one can do.',
  sections: [
    {
      id: 'add-employee',
      title: 'Add an employee',
      blocks: [
        {
          type: 'p',
          text: 'You manage your team in the web dashboard. The person you want to add must already have a JChat account: you look them up by username.',
        },
        {
          type: 'steps',
          items: [
            'In the dashboard, open **Configuration** (the gear at the bottom of the side menu) and go to **Employees**.',
            'Press **+ Add employee**.',
            'In **Username**, type their username (for example **@username**).',
            'In **Role**, choose one from the **Standard** group or a **Custom** one you created.',
            'Press **Add**. You will see a message like "Added @username as Cashier."',
          ],
        },
        {
          type: 'note',
          kind: 'important',
          text: 'If you see **No user found with username @username.**, check the spelling and make sure the person already has an account.',
        },
        {
          type: 'p',
          text: 'The person gets a notification on their phone: "added you as…". Under **Staff Roster** you see your whole team with their role and their status (for example **Active**).',
        },
      ],
    },
    {
      id: 'fixed-roles',
      title: 'The standard roles',
      blocks: [
        {
          type: 'p',
          text: 'These are the roles that come ready to use. You also see them under **Role Reference**, at the bottom of the **Employees** page:',
        },
        {
          type: 'list',
          items: [
            '**Manager**: full access: settings, offers, reports, staff.',
            '**Cashier**: processes orders and payments.',
            '**Waiter**: takes orders and manages table service.',
            '**Kitchen**: meant for kitchen staff.',
            '**Chat Moderator**: manages chat room content and users.',
            '**Analyst**: read-only access to analytics and reports.',
          ],
        },
        {
          type: 'p',
          text: 'You are the **Owner**: you have every permission, including billing and payouts. Those two are **Owner only** and cannot be given to anyone else.',
        },
      ],
    },
    {
      id: 'custom-roles',
      title: 'Create your own role',
      blocks: [
        {
          type: 'p',
          text: 'If none of the standard roles fits, create one with exactly the permissions you need. For example, someone who only handles reservations.',
        },
        {
          type: 'steps',
          items: [
            'In the **Configuration** menu, go to **Roles**.',
            'Press **New role** (or **Create first role** if you do not have any yet).',
            'Type the **Role name**, for example "Senior Cashier".',
            'If you want to start from a standard role, pick it under **Start from template**. It fills in the switches and then you can adjust any of them.',
            'Under **Permissions**, turn on only what that person needs. For example, **Manage reservations**, **Create / edit offers** or **Moderate chat**.',
            'Press **Create role**.',
          ],
        },
        {
          type: 'p',
          text: 'To change a role, press its edit button and then **Update role**. The new role shows up in the **Custom** group when you add an employee.',
        },
        {
          type: 'note',
          kind: 'tip',
          text: 'Start with few permissions and add more as needed. It is easier to give more access later than to take it away.',
        },
      ],
    },
    {
      id: 'remove-and-limits',
      title: 'Remove an employee and plan limits',
      blocks: [
        {
          type: 'steps',
          items: [
            'In **Employees**, find the person under **Staff Roster**.',
            'Press the remove button on their row.',
            'Confirm the message "Remove … from your staff? This cannot be undone."',
          ],
        },
        {
          type: 'p',
          text: 'If you delete a custom role, the employees who had it go back to showing their role as plain text.',
        },
        {
          type: 'p',
          text: 'The **Staff usage** bar tells you how many employees you have and how many your plan allows per venue: up to 10 with Business and up to 50 with Pro.',
        },
        {
          type: 'note',
          kind: 'important',
          text: 'If you reach the limit you will see "You have reached the employee limit on your current plan". See the plans in [Plans and free trial](/help/business/plans-and-trial).',
        },
      ],
    },
  ],
};

export default chapter;
