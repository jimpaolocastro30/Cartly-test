import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { CollectionReference, Firestore, getFirestore } from 'firebase-admin/firestore';

export const MAX_BATCH_SIZE = 500;

@Injectable()
export class FirestoreService {
  private readonly logger = new Logger(FirestoreService.name);
  private readonly app: App;
  readonly db: Firestore;

  constructor(config: ConfigService) {
    const projectId = config.get<string>('FIREBASE_PROJECT_ID') || 'cartly-dev';
    const emulatorHost = config.get<string>('FIRESTORE_EMULATOR_HOST');

    if (emulatorHost) {
      // firebase-admin reads this from process.env, not from ConfigService.
      process.env.FIRESTORE_EMULATOR_HOST = emulatorHost;
      this.logger.log(`Using Firestore Emulator at ${emulatorHost}`);
    }

    this.app =
      getApps()[0] ??
      initializeApp(
        emulatorHost ? { projectId } : { projectId, credential: applicationDefault() },
      );
    this.db = getFirestore(this.app);
  }

  itemsCollection(userId: string): CollectionReference {
    return this.db.collection('users').doc(userId).collection('items');
  }
}
