import { Injectable, NotFoundException } from '@nestjs/common';
import { DocumentSnapshot, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { FirestoreService, MAX_BATCH_SIZE } from '../firestore/firestore.service';
import { CreateItemDto } from './dto/create-item.dto';
import { ShoppingItem } from './interfaces/shopping-item.interface';

@Injectable()
export class ItemsService {
  constructor(private readonly firestore: FirestoreService) {}

  async findAll(userId: string): Promise<ShoppingItem[]> {
    const snapshot = await this.firestore
      .itemsCollection(userId)
      .orderBy('bought', 'asc')
      .orderBy('createdAt', 'desc')
      .get();
    return snapshot.docs.map((doc) => this.toItem(doc));
  }

  async create(userId: string, dto: CreateItemDto): Promise<ShoppingItem> {
    const ref = this.firestore.itemsCollection(userId).doc();
    await ref.set({
      name: dto.name,
      quantity: dto.quantity,
      bought: false,
      createdAt: FieldValue.serverTimestamp(),
    });
    return this.toItem(await ref.get());
  }

  async toggle(userId: string, itemId: string): Promise<ShoppingItem> {
    const ref = this.firestore.itemsCollection(userId).doc(itemId);
    await this.firestore.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) {
        throw this.notFound(itemId);
      }
      tx.update(ref, { bought: !snapshot.get('bought') });
    });
    return this.toItem(await ref.get());
  }

  async remove(userId: string, itemId: string): Promise<void> {
    const ref = this.firestore.itemsCollection(userId).doc(itemId);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      throw this.notFound(itemId);
    }
    await ref.delete();
  }

  /** Deletes all bought items with batched writes; returns the number removed. */
  async clearBought(userId: string): Promise<number> {
    const snapshot = await this.firestore
      .itemsCollection(userId)
      .where('bought', '==', true)
      .get();

    for (let i = 0; i < snapshot.docs.length; i += MAX_BATCH_SIZE) {
      const batch = this.firestore.db.batch();
      snapshot.docs.slice(i, i + MAX_BATCH_SIZE).forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
    return snapshot.size;
  }

  private notFound(itemId: string): NotFoundException {
    return new NotFoundException(`Item "${itemId}" was not found`);
  }

  private toItem(doc: DocumentSnapshot): ShoppingItem {
    const data = doc.data() ?? {};
    const createdAt = data.createdAt as Timestamp | undefined;
    return {
      id: doc.id,
      name: data.name,
      quantity: data.quantity,
      bought: data.bought === true,
      createdAt: createdAt ? createdAt.toDate().toISOString() : null,
    };
  }
}
