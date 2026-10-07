import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';

/**
 * Runs the full HTTP stack against the Firestore Emulator.
 * Start the emulator first: `npm run emulators`, then
 * `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run test:e2e`.
 */
const describeIfEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

describeIfEmulator('Items API (e2e, Firestore Emulator)', () => {
  let app: INestApplication;
  const runId = Date.now();
  const userA = `e2e-a-${runId}`;
  const userB = `e2e-b-${runId}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  const api = () => request(app.getHttpServer());

  const add = async (user: string, name: string, quantity = 1) =>
    (await api().post('/api/items').set('X-User-ID', user).send({ name, quantity }).expect(201))
      .body;

  it('rejects requests without X-User-ID', async () => {
    const res = await api().get('/api/items').expect(401);
    expect(res.body).toEqual({ statusCode: 401, message: 'X-User-ID header is required' });
  });

  it('rejects invalid items with a readable message', async () => {
    const res = await api()
      .post('/api/items')
      .set('X-User-ID', userA)
      .send({ name: '  ', quantity: 0 })
      .expect(400);
    expect(res.body.message).toContain('Item name cannot be empty');
    expect(res.body.message).toContain('Quantity must be at least 1');
  });

  it('supports the full list lifecycle with database ordering', async () => {
    const eggs = await add(userA, 'Eggs', 6);
    const milk = await add(userA, 'Milk', 2);
    await add(userA, 'Bread');
    expect(milk.bought).toBe(false);

    await api().patch(`/api/items/${eggs.id}/toggle`).set('X-User-ID', userA).expect(200);
    await api().patch(`/api/items/${milk.id}/toggle`).set('X-User-ID', userA).expect(200);

    let list = await api().get('/api/items').set('X-User-ID', userA).expect(200);
    expect(list.body.items.map((i: { name: string }) => i.name)).toEqual(['Bread', 'Milk', 'Eggs']);

    await api().delete('/api/items/bought').set('X-User-ID', userA).expect(204);
    list = await api().get('/api/items').set('X-User-ID', userA).expect(200);
    expect(list.body.items.map((i: { name: string }) => i.name)).toEqual(['Bread']);

    await api().delete('/api/items/bought').set('X-User-ID', userA).expect(204);
  });

  it("does not let one user see or change another user's item", async () => {
    const item = await add(userB, 'Private');

    const list = await api().get('/api/items').set('X-User-ID', userA).expect(200);
    expect(list.body.items.find((i: { id: string }) => i.id === item.id)).toBeUndefined();

    await api().patch(`/api/items/${item.id}/toggle`).set('X-User-ID', userA).expect(404);
    await api().delete(`/api/items/${item.id}`).set('X-User-ID', userA).expect(404);
  });

  it('returns 404 for a missing item', async () => {
    const res = await api().delete('/api/items/does-not-exist').set('X-User-ID', userA).expect(404);
    expect(res.body.statusCode).toBe(404);
  });
});
