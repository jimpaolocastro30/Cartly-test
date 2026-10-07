import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { FirestoreService } from '../src/firestore/firestore.service';

type Data = Record<string, any>;
type Order = { field: string; direction: 'asc' | 'desc' };
type Filter = { field: string; value: unknown };

/**
 * Minimal in-memory stand-in for the parts of the Firestore Admin SDK that
 * ItemsService uses. Records calls so tests can assert on query/batch usage.
 */
export class FakeFirestore {
  readonly store = new Map<string, Map<string, Data>>();
  readonly orderByCalls: Order[] = [];
  readonly committedBatches: string[][] = [];
  directDeletes = 0;
  private nextId = 1;
  private clock = 0;

  readonly db = {
    runTransaction: async <T>(fn: (tx: any) => Promise<T>): Promise<T> =>
      fn({
        get: (ref: FakeDocRef) => ref.get(),
        update: (ref: FakeDocRef, data: Data) => ref.update(data),
      }),
    batch: () => {
      const ops: FakeDocRef[] = [];
      return {
        delete: (ref: FakeDocRef) => ops.push(ref),
        commit: async () => {
          ops.forEach((ref) => ref.collection.delete(ref.id));
          this.committedBatches.push(ops.map((ref) => ref.id));
        },
      };
    },
  };

  asService(): FirestoreService {
    return this as unknown as FirestoreService;
  }

  itemsCollection(userId: string): FakeQuery {
    if (!this.store.has(userId)) this.store.set(userId, new Map());
    return new FakeQuery(this, this.store.get(userId)!, [], []);
  }

  /** Seeds an item directly, bypassing the service. Later seeds are newer. */
  seed(userId: string, data: { name: string; quantity?: number; bought?: boolean }): string {
    const id = this.generateId();
    this.itemsCollection(userId);
    this.store.get(userId)!.set(id, {
      quantity: 1,
      bought: false,
      ...data,
      createdAt: this.tick(),
    });
    return id;
  }

  generateId(): string {
    return `item-${this.nextId++}`;
  }

  tick(): Timestamp {
    return Timestamp.fromMillis(1_700_000_000_000 + this.clock++ * 1000);
  }
}

class FakeQuery {
  constructor(
    private readonly fake: FakeFirestore,
    private readonly items: Map<string, Data>,
    private readonly orders: Order[],
    private readonly filters: Filter[],
  ) {}

  doc(id?: string): FakeDocRef {
    return new FakeDocRef(this.fake, this.items, id ?? this.fake.generateId());
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): FakeQuery {
    this.fake.orderByCalls.push({ field, direction });
    return new FakeQuery(this.fake, this.items, [...this.orders, { field, direction }], this.filters);
  }

  where(field: string, _op: '==', value: unknown): FakeQuery {
    return new FakeQuery(this.fake, this.items, this.orders, [...this.filters, { field, value }]);
  }

  async get() {
    let entries = [...this.items.entries()].filter(([, data]) =>
      this.filters.every((f) => data[f.field] === f.value),
    );
    entries = entries.sort(([, a], [, b]) => {
      for (const { field, direction } of this.orders) {
        const cmp = compare(a[field], b[field]);
        if (cmp !== 0) return direction === 'asc' ? cmp : -cmp;
      }
      return 0;
    });
    const docs = entries.map(([id]) => this.doc(id).snapshot());
    return { docs, size: docs.length, empty: docs.length === 0 };
  }
}

class FakeDocRef {
  constructor(
    private readonly fake: FakeFirestore,
    readonly collection: Map<string, Data>,
    readonly id: string,
  ) {}

  snapshot() {
    const data = this.collection.get(this.id);
    return {
      id: this.id,
      exists: data !== undefined,
      ref: this,
      data: () => (data ? { ...data } : undefined),
      get: (field: string) => data?.[field],
    };
  }

  async get() {
    return this.snapshot();
  }

  async set(data: Data) {
    const resolved: Data = {};
    for (const [key, value] of Object.entries(data)) {
      resolved[key] = value instanceof FieldValue ? this.fake.tick() : value;
    }
    this.collection.set(this.id, resolved);
  }

  async update(data: Data) {
    if (!this.collection.has(this.id)) throw new Error('NOT_FOUND');
    this.collection.set(this.id, { ...this.collection.get(this.id), ...data });
  }

  async delete() {
    this.fake.directDeletes++;
    this.collection.delete(this.id);
  }
}

function compare(a: unknown, b: unknown): number {
  if (a instanceof Timestamp && b instanceof Timestamp) return a.toMillis() - b.toMillis();
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  if (a === b) return 0;
  return (a as any) < (b as any) ? -1 : 1;
}
