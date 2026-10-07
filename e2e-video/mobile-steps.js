/**
 * Mobile scenario: every step taps/types in the real Flutter app (web build in a
 * phone frame) and checks both what the app shows and what the API stores.
 * `t` is the driver from record-mobile.js.
 */
const unbought = (name) => name;
const bought = (name) => `[x] ${name}`;

module.exports = [
  {
    title: 'Open the app',
    narration:
      'This is an end-to-end test of the Cartly Flutter app on a simulated phone. ' +
      'Every tap goes through the real Nest J S API to a Firestore emulator. ' +
      "Alice opens the app, and since her list is empty, she sees the empty state.",
    run: async (t) => {
      await t.openApp();
      await t.expect(await t.waitForText(/Your shopping list is empty/), 'Empty state is shown');
    },
  },
  {
    title: 'Backend validation',
    narration:
      'Alice taps the plus button and tries to add an item with no name and a quantity of zero. ' +
      'The backend rejects it, and the app shows the reason inside the dialog.',
    run: async (t) => {
      await t.tap({ role: 'button', name: 'Add item' });
      await t.type({ name: 'Item name' }, '');
      await t.type({ name: 'Quantity' }, '0');
      await t.tap({ role: 'button', name: 'Add' });
      await t.expect(await t.waitForText(/Item name cannot be empty/), 'Empty-name error shown in the dialog');
      await t.expect(await t.waitForText(/Quantity must be at least 1/), 'Quantity error shown in the dialog');
      await t.expect((await t.apiNames('alice')).length === 0, 'Nothing was saved in Firestore');
    },
  },
  {
    title: 'Add items',
    narration:
      'Now she adds eggs, milk, bread, and apples. Each item starts unticked, ' +
      'and the list shows the newest first, exactly as Firestore returns it.',
    run: async (t) => {
      await t.addItem('Eggs', 6, { dialogOpen: true });
      await t.addItem('Milk', 2);
      await t.addItem('Bread', 1);
      await t.addItem('Apples', 4);
      await t.expectList(['Apples', 'Bread', 'Milk', 'Eggs'].map(unbought));
      await t.expectApi('alice', ['Apples', 'Bread', 'Milk', 'Eggs']);
    },
  },
  {
    title: 'Tick items off',
    narration:
      'In the store, Alice ticks off the milk, and then the eggs. ' +
      'Each one moves down to the bought section, which is also ordered newest first.',
    run: async (t) => {
      await t.toggle('Milk');
      await t.expectList(['Apples', 'Bread', 'Eggs', bought('Milk')]);
      await t.toggle('Eggs');
      await t.expectList(['Apples', 'Bread', bought('Milk'), bought('Eggs')]);
    },
  },
  {
    title: 'Clear bought items',
    narration:
      'One tap on Clear Bought, and a confirmation, removes everything she has bought in a single batch. ' +
      'The apples and bread stay on the list.',
    run: async (t) => {
      await t.tap({ role: 'button', name: 'Clear Bought' });
      await t.tap({ role: 'button', name: 'Clear' });
      await t.expectList(['Apples', 'Bread']);
      await t.expectApi('alice', ['Apples', 'Bread']);
    },
  },
  {
    title: 'Delete an item',
    narration: 'She added apples by mistake, so she taps the delete icon. The apples disappear.',
    run: async (t) => {
      await t.tap({ role: 'button', name: 'Delete Apples' });
      await t.expectList(['Bread']);
      await t.expectApi('alice', ['Bread']);
    },
  },
  {
    title: 'Lists are private',
    narration:
      'Meanwhile, Bob adds a surprise gift to his own list from his phone. ' +
      'When Alice reopens the app, she still only sees her own bread.',
    run: async (t) => {
      await t.apiAdd('bob', 'Gift for Alice', 1);
      await t.expectApi('bob', ['Gift for Alice']);
      await t.openApp();
      await t.expectList(['Bread']);
      await t.expect(!(await t.hasText(/Gift for Alice/)), "Bob's item is not visible to Alice");
    },
  },
  {
    title: 'Item removed elsewhere',
    narration:
      'Next, the bread is deleted from another device while Alice still sees it. ' +
      'When she ticks it, the app shows a clear not found message instead of crashing, and refreshes the list.',
    run: async (t) => {
      await t.apiDeleteAll('alice');
      await t.toggle('Bread');
      await t.expect(await t.waitForText(/was not found/), 'Not-found message shown');
      await t.expect(await t.waitForText(/Your shopping list is empty/), 'List refreshed to the empty state');
    },
  },
  {
    title: 'Server offline, then Retry',
    narration:
      'Finally, the server goes offline and Alice opens the app. She sees an error with a Retry button. ' +
      'Once the server is back, one tap on Retry loads her list again.',
    run: async (t) => {
      await t.stopBackend();
      await t.openApp();
      await t.expect(await t.waitForText(/Couldn't load your list/), 'Error state is shown');
      await t.expect(await t.waitForText(/Could not reach the server/), 'Error explains the problem');
      await t.startBackend();
      await t.tap({ role: 'button', name: 'Retry' });
      await t.expect(await t.waitForText(/Your shopping list is empty/), 'Retry reloads the list');
    },
  },
  {
    title: 'All checks passed',
    narration: 'All mobile end-to-end checks passed.',
    run: async (t) => t.finish(true, 'All mobile end-to-end checks passed'),
  },
];

module.exports.failureNarration = 'A check failed. The failing check is shown in red on screen.';
