/* 
  main.ts
*/

import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';

async function bootstrap() {
  // Create a new NestJS microservice
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.KAFKA,
      options: {
        client: {
          // Specifies the Kafka brokers to which the microservice will connect.
          brokers: [process.env.KAFKA_BROKER],
        },
        consumer: {
          // It will allow in case of horizontal scaling (more instances), Kafka will equally distribute
          //    messages among all microservice instances that share the same groupId.
          //    This helps distribute the processing load and ensure that all messages are consumed and processed efficiently.
          //  Additionally, when multiple consumers belong to the same group and are subscribed
          //    to the same topic, Kafka guarantees that each message is delivered to only one of the consumers within the group.
          //    This prevents multiple consumers within the same group from processing the same message.
          groupId: 'financial-movement-group',
        },
      },
    },
  );
  await app.listen();
}
bootstrap();
