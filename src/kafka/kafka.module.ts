/* 
  kafka.module.ts
*/

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Kafka } from 'kafkajs';

const KAFKA_PROVIDER = 'KAFKA';
const PRODUCER_PROVIDER = 'PRODUCER_PROVIDER';
const CONSUMER_PROVIDER = 'CONSUMER_PROVIDER';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: KAFKA_PROVIDER,
      useFactory: async (configService: ConfigService) => {
        const kafka = new Kafka({
          clientId: 'financial-movement-id',
          brokers: [configService.get<string>('KAFKA_BROKER')],
        });
        return kafka;
      },
      inject: [ConfigService],
    },
    {
      provide: PRODUCER_PROVIDER,
      useFactory: async (kafka: Kafka) => {
        const producer = kafka.producer();
        await producer.connect();
        console.log('Producer connected');
        return producer;
      },
      inject: [KAFKA_PROVIDER],
    },
    {
      provide: CONSUMER_PROVIDER,
      useFactory: async (kafka: Kafka) => {
        const consumer = kafka.consumer({ groupId: 'my-kafka-consumer' });
        await consumer.connect();
        console.log('Consumer connected');
        await consumer.subscribe({ topic: 'start-transactions-credit-card' });
        await consumer.subscribe({ topic: 'fmsCompensation' });
        await consumer.subscribe({ topic: 'fmsMovements' });
        return consumer;
      },
      inject: [KAFKA_PROVIDER],
    },
  ],
  exports: [PRODUCER_PROVIDER, CONSUMER_PROVIDER],
})
export class KafkaModule {}
