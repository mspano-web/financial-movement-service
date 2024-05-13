/* 
  app.module.ts
*/

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongoModule } from './mongodb/mongo.module';
import { KafkaModule } from './kafka/kafka.module';
import { FinancialMovementModule } from './financial-movement/financial-movement.module';
import { FinancialMovementService } from './financial-movement/financial-movement.service';

@Module({
  imports: [
    ConfigModule.forRoot(),
    MongoModule,
    KafkaModule,
    FinancialMovementModule,
  ],
  controllers: [],
  providers: [FinancialMovementService],
})
export class AppModule {}
