/* 
  financial-movement.module.ts
*/

import { Module } from '@nestjs/common';
import { KafkaModule } from '../kafka/kafka.module';
import { MongoModule } from '../mongodb/mongo.module';
import { FinancialMovementService } from './financial-movement.service';
import { ConfigModule } from '@nestjs/config';
import { Movement, MovementSchema } from './financial.schema';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: Movement.name, schema: MovementSchema },
    ]),
    KafkaModule,
    MongoModule,
  ],
  providers: [FinancialMovementService],
  exports: [MongooseModule],
})
export class FinancialMovementModule {}
