/**
 * Each step is narrated while its `run` executes real HTTP calls against the API.
 * `t` is the test context from record.js; `state` is shared between steps.
 */
const state = {};

module.exports = [
  {
    title: 'Cartly end-to-end test',
    narration:
      'This is an end-to-end test of the Cartly shopping list API. ' +
      'Every request goes through the real Nest J S server to a local Firestore emulator.',
    run: async () => {},
  },
  {
    title: 'Requests need a user ID',
    narration:
      'First, a request without the X User I D header. The API must reject it with a 401.',
    run: async (t) => {
      const res = await t.call('GET', '/items');
      await t.expectStatus(res, 401, 'Missing X-User-ID is rejected with 401');
    },
  },
  {
    title: 'Backend validation',
    narration:
      'Next, Alice tries to add an item with a blank name and a quantity of zero. ' +
      'The backend rejects it before anything is written, and explains why.',
    run: async (t) => {
      const res = await t.call('POST', '/items', { user: 'alice', body: { name: '  ', quantity: 0 } });
      await t.expectStatus(res, 400, 'Invalid item is rejected with 400');
      const message = String(res.body?.message ?? '');
      await t.expect(message.includes('Item name cannot be empty'), 'Empty-name message returned');
      await t.expect(message.includes('Quantity must be at least 1'), 'Quantity message returned');
      const names = await t.refresh('alice');
      await t.expect(names.length === 0, 'Nothing was written to Firestore');
    },
  },
  {
    title: 'Add items',
    narration:
      'Alice adds eggs, milk, and bread. Each new item starts as not bought, ' +
      'and Firestore returns the list newest first.',
    run: async (t) => {
      for (const [name, quantity] of [['Eggs', 6], ['Milk', 2], ['Bread', 1]]) {
        const res = await t.call('POST', '/items', { user: 'alice', body: { name, quantity } });
        await t.expectStatus(res, 201, `${name} created with 201`);
        await t.expect(res.body?.bought === false, `${name} starts as not bought`);
        state[name] = res.body.id;
      }
      const names = await t.refresh('alice');
      await t.expectOrder(names, ['Bread', 'Milk', 'Eggs']);
    },
  },
  {
    title: 'Mark items bought',
    narration:
      'Alice ticks off the milk, then the eggs. Bought items move below the unbought ones, ' +
      'and each group stays newest first. The sorting is done by the database query.',
    run: async (t) => {
      let res = await t.call('PATCH', `/items/${state.Milk}/toggle`, { user: 'alice' });
      await t.expectStatus(res, 200, 'Milk toggled with 200');
      await t.expect(res.body?.bought === true, 'Milk is now bought');
      await t.expectOrder(await t.refresh('alice'), ['Bread', 'Eggs', 'Milk']);

      res = await t.call('PATCH', `/items/${state.Eggs}/toggle`, { user: 'alice' });
      await t.expectStatus(res, 200, 'Eggs toggled with 200');
      await t.expectOrder(await t.refresh('alice'), ['Bread', 'Milk', 'Eggs']);
    },
  },
  {
    title: 'Clear bought items',
    narration:
      'Now a single request clears everything Alice has bought, using one batch write. ' +
      'Bread is kept. Running it again with nothing bought still succeeds.',
    run: async (t) => {
      let res = await t.call('DELETE', '/items/bought', { user: 'alice' });
      await t.expectStatus(res, 204, 'Clear bought returns 204');
      await t.expectOrder(await t.refresh('alice'), ['Bread']);
      res = await t.call('DELETE', '/items/bought', { user: 'alice' });
      await t.expectStatus(res, 204, 'Clearing again with nothing bought still returns 204');
    },
  },
  {
    title: 'Lists are private',
    narration:
      'Bob adds a private item. Alice cannot see it in her list, ' +
      'and trying to toggle or delete it with her user I D returns not found.',
    run: async (t) => {
      const created = await t.call('POST', '/items', { user: 'bob', body: { name: 'Gift for Alice', quantity: 1 } });
      await t.expectStatus(created, 201, "Bob's item created");
      const bobItem = created.body.id;
      await t.refresh('bob');

      const names = await t.refresh('alice');
      await t.expect(!names.includes('Gift for Alice'), "Alice's list does not include Bob's item");
      const toggle = await t.call('PATCH', `/items/${bobItem}/toggle`, { user: 'alice' });
      await t.expectStatus(toggle, 404, "Alice cannot toggle Bob's item (404)");
      const del = await t.call('DELETE', `/items/${bobItem}`, { user: 'alice' });
      await t.expectStatus(del, 404, "Alice cannot delete Bob's item (404)");
      const bobNames = await t.refresh('bob');
      await t.expectOrder(bobNames, ['Gift for Alice']);
    },
  },
  {
    title: 'Missing items',
    narration:
      'Finally, deleting an item that does not exist returns a clear 404 error instead of crashing.',
    run: async (t) => {
      const res = await t.call('DELETE', '/items/does-not-exist', { user: 'alice' });
      await t.expectStatus(res, 404, 'Missing item returns 404');
      await t.expect(typeof res.body?.message === 'string', 'Error response includes a message');
    },
  },
  {
    title: 'All checks passed',
    narration: 'All end-to-end checks passed.',
    run: async (t) => t.finish(true, 'All end-to-end checks passed'),
  },
];

module.exports.failureNarration = 'A check failed. The failing check is shown in red on screen.';
