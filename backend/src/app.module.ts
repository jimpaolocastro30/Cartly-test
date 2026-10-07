import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FirestoreModule } from './firestore/firestore.module';
import { ItemsModule } from './items/items.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), FirestoreModule, ItemsModule],
})
export class AppModule {}
