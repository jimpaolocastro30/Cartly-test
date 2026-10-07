import { NotFoundException } from '@nestjs/common';
import { FakeFirestore } from '../../test/fake-firestore';
import { MAX_BATCH_SIZE } from '../firestore/firestore.service';
import { ItemsService } from './items.service';

const USER_A = 'user-a';
const USER_B = 'user-b';

describe('ItemsService', () => {
  let fake: FakeFirestore;
  let service: ItemsService;

  beforeEach(() => {
    fake = new FakeFirestore();
    service = new ItemsService(fake.asService());
  });

  describe('findAll', () => {
    it('asks Firestore to order by bought ASC then createdAt DESC', async () => {
      await service.findAll(USER_A);
      expect(fake.orderByCalls).toEqual([
        { field: 'bought', direction: 'asc' },
        { field: 'createdAt', direction: 'desc' },
      ]);
    });

    it('returns unbought items first, newest first within each group', async () => {
      fake.seed(USER_A, { name: 'Eggs', bought: true });
      fake.seed(USER_A, { name: 'Milk' });
      fake.seed(USER_A, { name: 'Rice', bought: true });
      fake.seed(USER_A, { name: 'Bread' });

      const names = (await service.findAll(USER_A)).map((i) => i.name);
      expect(names).toEqual(['Bread', 'Milk', 'Rice', 'Eggs']);
    });

    it('returns an empty list for a user with no items', async () => {
      expect(await service.findAll(USER_A)).toEqual([]);
    });

    it("never returns another user's items", async () => {
      fake.seed(USER_B, { name: 'Secret' });
      expect(await service.findAll(USER_A)).toEqual([]);
    });
  });

  describe('create', () => {
    it('stores the item with bought=false and a createdAt timestamp', async () => {
      const item = await service.create(USER_A, { name: 'Milk', quantity: 2 });
      expect(item).toMatchObject({ name: 'Milk', quantity: 2, bought: false });
      expect(item.id).toBeTruthy();
      expect(item.createdAt).toEqual(expect.any(String));
      expect(fake.store.get(USER_A)!.get(item.id)).toMatchObject({ bought: false });
    });

    it("scopes the new item to the caller's collection", async () => {
      const item = await service.create(USER_A, { name: 'Milk', quantity: 1 });
      expect(fake.store.get(USER_B)?.has(item.id) ?? false).toBe(false);
    });
  });

  describe('toggle', () => {
    it('flips bought false -> true -> false', async () => {
      const id = fake.seed(USER_A, { name: 'Milk' });
      expect((await service.toggle(USER_A, id)).bought).toBe(true);
      expect((await service.toggle(USER_A, id)).bought).toBe(false);
    });

    it('throws NotFound for a missing item', async () => {
      await expect(service.toggle(USER_A, 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it("throws NotFound when toggling another user's item and leaves it unchanged", async () => {
      const id = fake.seed(USER_B, { name: 'Milk' });
      await expect(service.toggle(USER_A, id)).rejects.toBeInstanceOf(NotFoundException);
      expect(fake.store.get(USER_B)!.get(id)!.bought).toBe(false);
    });
  });

  describe('remove', () => {
    it('deletes an existing item', async () => {
      const id = fake.seed(USER_A, { name: 'Milk' });
      await service.remove(USER_A, id);
      expect(fake.store.get(USER_A)!.has(id)).toBe(false);
    });

    it('throws NotFound for a missing item', async () => {
      await expect(service.remove(USER_A, 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it("throws NotFound when deleting another user's item and keeps it", async () => {
      const id = fake.seed(USER_B, { name: 'Milk' });
      await expect(service.remove(USER_A, id)).rejects.toBeInstanceOf(NotFoundException);
      expect(fake.store.get(USER_B)!.has(id)).toBe(true);
    });
  });

  describe('clearBought', () => {
    it('removes bought items and keeps unbought ones', async () => {
      fake.seed(USER_A, { name: 'Milk' });
      fake.seed(USER_A, { name: 'Bread' });
      fake.seed(USER_A, { name: 'Eggs', bought: true });
      fake.seed(USER_A, { name: 'Chicken', bought: true });

      expect(await service.clearBought(USER_A)).toBe(2);
      const names = (await service.findAll(USER_A)).map((i) => i.name);
      expect(names).toEqual(['Bread', 'Milk']);
    });

    it('uses a single batch commit instead of per-document deletes', async () => {
      fake.seed(USER_A, { name: 'Eggs', bought: true });
      fake.seed(USER_A, { name: 'Rice', bought: true });
      fake.seed(USER_A, { name: 'Chicken', bought: true });

      await service.clearBought(USER_A);
      expect(fake.committedBatches).toHaveLength(1);
      expect(fake.committedBatches[0]).toHaveLength(3);
      expect(fake.directDeletes).toBe(0);
    });

    it('splits very large clears into batches of at most 500 writes', async () => {
      for (let i = 0; i < MAX_BATCH_SIZE + 1; i++) {
        fake.seed(USER_A, { name: `Item ${i}`, bought: true });
      }
      await service.clearBought(USER_A);
      expect(fake.committedBatches.map((b) => b.length)).toEqual([MAX_BATCH_SIZE, 1]);
    });

    it('succeeds without error when there are no bought items', async () => {
      fake.seed(USER_A, { name: 'Milk' });
      await expect(service.clearBought(USER_A)).resolves.toBe(0);
      expect(fake.committedBatches).toHaveLength(0);
    });

    it("does not touch another user's bought items", async () => {
      fake.seed(USER_B, { name: 'Eggs', bought: true });
      await service.clearBought(USER_A);
      expect(fake.store.get(USER_B)!.size).toBe(1);
    });
  });
});
