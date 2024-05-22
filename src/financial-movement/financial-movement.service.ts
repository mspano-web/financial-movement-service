/* 
  financial-movement.service.ts
*/

import { Injectable, Inject } from '@nestjs/common';
import { Producer, Consumer } from 'kafkajs';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Movement } from './financial.schema';
import { TransactionDto } from '../dto/transaction.dto';
import { EMPTY, Observable } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ClientSession } from 'mongoose';
import { TransactionStatus } from '../types/results';
import { KafkaTopics } from '../types/topics';

@Injectable()
export class FinancialMovementService {
  constructor(
    @Inject('PRODUCER_PROVIDER') private readonly kafkaProducer: Producer,
    @Inject('CONSUMER_PROVIDER') private readonly kafkaConsumer: Consumer,
    @InjectModel(Movement.name)
    private readonly financialDataLogModel: Model<Movement>,
  ) {}

  // -----------------------------------------------------------------

  onModuleInit() {
    this.setupConsumer();
  }

  // ------------------------------------------------

  onModuleDestroy() {
    this.stopConsumer();
  }

  // -----------------------------------------------------------------

  private setupConsumer() {
    // The Kafka consumer starts and starts listening for messages on the specified topics
    this.kafkaConsumer.run({
      // The object with an each Message attribute defines a callback function that is executed
      //    every time a message is received on one of the topics to which the consumer is subscribed.
      eachMessage: async ({ topic, message }) => {
        switch (topic) {
          case KafkaTopics.START_TRANSACTIONS_CREDIT_CARD:
            this.handleTransaction(message.value.toString()).subscribe();
            break;
          case KafkaTopics.FMS_COMPENSATION:
            this.handleCompensation(message.value.toString()).subscribe();
            break;
          case KafkaTopics.FMS_MOVEMENTS:
            this.handleMovements(message.value.toString()).subscribe();
            break;
          default:
            console.log(
              'Received message:',
              message,
              ' from unknown topic: ',
              topic,
            );
            break;
        }
      },
    });
  }

  // -----------------------------------------------------------------

  private handleTransaction(transactionMessage: string): Observable<void> {
    const transaction: TransactionDto = JSON.parse(transactionMessage);
    let errorType = TransactionStatus.FAILED;
    console.log('---------------------------------------------');
    console.log('handleTransaction start - transaction: ', transaction);

    return new Observable<void>((observer) => {
      this.financialDataLogModel.db
        .startSession()
        .then((session) => {
          try {
            session.startTransaction();
          } catch (transationError) {
            this.handleError(
              session,
              transaction,
              transationError.message,
              errorType,
            );
            observer.error(transationError);
            return;
          }

          const financialDataLog = new this.financialDataLogModel(transaction);
          financialDataLog
            .save()
            .then(() => {
              this.sendMessage(KafkaTopics.FMS_SUCCESS, transaction).subscribe({
                complete: async () => {
                  try {
                    await session.commitTransaction();
                    observer.complete();
                  } catch (commitError) {
                    errorType = TransactionStatus.FAILED_INCONSISTENCE;
                    console.error(
                      'Failed to commit transaction id:',
                      transaction.id,
                      ' error: ',
                      commitError,
                    );
                    this.handleError(
                      session,
                      transaction,
                      commitError.message,
                      errorType,
                    );
                    observer.error(commitError);
                  } finally {
                    try {
                      session.endSession();
                    } catch (endSessionError) {
                      console.error(
                        'Failed to end session id:',
                        transaction.id,
                        ' error: ',
                        endSessionError,
                      );
                      observer.error(endSessionError);
                    }
                  }
                },
                error: (sendError) => {
                  console.error(
                    'Failed to send message to: ',
                    KafkaTopics.FMS_SUCCESS,
                    ' topic, transaction id:',
                    transaction.id,
                    ' error: ',
                    sendError,
                  );
                  this.handleError(
                    session,
                    transaction,
                    sendError.message,
                    errorType,
                  );
                  observer.error(sendError);
                },
              });
            })
            .catch((saveError) => {
              console.error(
                'Failed to save financial data log transaction id:',
                transaction.id,
                ' error: ',
                saveError,
              );
              this.handleError(
                session,
                transaction,
                saveError.message,
                errorType,
              );
              observer.error(saveError);
            });
        })
        .catch((sessionError) => {
          this.handleError(null, transaction, sessionError.message, errorType);
          observer.error(sessionError);
        });
    }).pipe(
      catchError((error) => {
        console.error(
          'Error processing the transaction id:',
          transaction.id,
          ' error: ',
          error,
        );
        return EMPTY;
      }),
    );
  }

  // -----------------------------------------------------------------

  private handleCompensation(message: string): Observable<void> {
    const transaction: TransactionDto = JSON.parse(message);
    console.log('---------------------------------------------');
    console.log('handleCompensation start - transaction: ', transaction);

    // Start - Test case compensation with failure -------------------
    if (
      transaction.credit_card_number &&
      transaction.credit_card_number === '4444444444'
    ) {
      console.log(
        'Test Case - Force Fail & Compensation with failure workflow',
      );
      this.handleError(
        null,
        transaction,
        'Test Case - Force Fail & Compensation with failure workflow',
        TransactionStatus.FAILED_INCONSISTENCE,
      );
      return new Observable<void>((observer) => {
        observer.error(
          new Error(
            'Test Case - Force Fail & Compensation with failure workflow',
          ),
        );
      }).pipe(
        catchError((error) => {
          console.error(
            'Test case failure in handleCompensation transaction id:',
            transaction.id,
            ' error: ',
            error,
          );
          return EMPTY;
        }),
      );
    }
    // End - Test case compensation with failure-------------------

    return new Observable<void>((observer) => {
      this.financialDataLogModel
        .updateOne({ id: transaction.id }, { status: 'COMPENSATION' })
        .then(() => {
          console.log(
            'handleCompensation finished OK - transaction id:',
            transaction.id,
          );
          observer.complete();
        })
        .catch((error) => {
          console.error(
            'handleCompensation - Failure - update database - transaction id:',
            transaction.id,
            ' error: ',
            error,
          );
          this.handleError(
            null,
            transaction,
            error.message,
            TransactionStatus.FAILED_INCONSISTENCE,
          );
          observer.error(error);
        });
    }).pipe(
      catchError((error) => {
        console.error(
          'Failure in handleCompensation transaction id:',
          transaction.id,
          ' error: ',
          error,
        );
        return EMPTY;
      }),
    );
  }

  // -----------------------------------------------------------------

  private handleMovements(message: string): Observable<void> {
    const transaction: TransactionDto = JSON.parse(message);

    console.log('---------------------------------------------');
    console.log('handleMovements start - transaction: ', transaction);
    const maxDate = new Date(transaction.transaction_datetime);
    maxDate.setHours(maxDate.getHours() - 6);

    return new Observable<void>((observer) => {
      this.financialDataLogModel
        .find({
          status: { $ne: 'COMPENSATION' },
          transaction_datetime: { $gt: maxDate },
          location: { $ne: transaction.location },
          credit_card_number: transaction.credit_card_number,
        })
        .then((dataLogs) => {
          const messages = {
            result: 'OK',
            transaction: transaction,
            movements: dataLogs,
          };

          // Start - Test case compensation -------------------
          if (
            transaction.credit_card_number &&
            transaction.credit_card_number === '3333333333'
          ) {
            console.log(
              'Test Case - Force Fail & Compensation workflow - transaction id:',
              transaction.id,
            );
            observer.error(
              new Error('Test Case - Force Fail & Compensation workflow'),
            );
          }
          // End - Test case compensation -------------------

          console.log('----------------------------------------------');
          console.log('handleMovements response messages: ', messages);
          this.sendMessage(
            KafkaTopics.FMS_MOVEMENTS_REPLAY,
            messages,
          ).subscribe({
            next: () => {
              observer.complete();
            },
            error: (error) => {
              this.handleError(
                null,
                transaction,
                error.message,
                TransactionStatus.FAILED,
              );
              observer.error(error);
            },
          });
        })
        .catch((error) => {
          console.error(
            'Failure to find financial data logs - transaction id:',
            transaction.id,
            ' error:',
            error,
          );
          const messages = {
            result: TransactionStatus.FAILED,
            transaction: transaction,
            error: 'Failure to find financial data logs',
          };
          this.sendMessage(
            KafkaTopics.FMS_MOVEMENTS_REPLAY,
            messages,
          ).subscribe({
            next: () => {
              observer.complete();
            },
            error: (error) => {
              this.handleError(
                null,
                transaction,
                error.message,
                TransactionStatus.FAILED,
              );
              observer.error(error);
            },
          });
        });
    }).pipe(
      catchError((error) => {
        console.error(
          'Failure to obtain historical information transaction id:',
          transaction.id,
          ' error: ',
          error,
        );
        return EMPTY;
      }),
    );
  }

  // -----------------------------------------------------------------

  private sendMessage(topic: string, message: any): Observable<void> {
    return new Observable<void>((observer) => {
      this.kafkaProducer
        .send({
          topic,
          messages: [{ value: JSON.stringify(message) }],
        })
        .then(() => {
          observer.complete();
        })
        .catch((error) => {
          console.error(`Failed to send message to ${topic}:`, error);
          observer.error(error);
        });
    });
  }

  // -----------------------------------------------------------------

  private handleError(
    session: ClientSession | null,
    transaction: TransactionDto,
    error: string,
    result: TransactionStatus,
  ): void {
    if (session && session.inTransaction()) {
      new Promise<void>(async (resolve) => {
        try {
          await session.abortTransaction();
        } catch (abortError) {
          console.error(
            'Failed to abort transaction id:',
            transaction.id,
            ' error: ',
            abortError,
          );
          result = TransactionStatus.FAILED_INCONSISTENCE;
        } finally {
          resolve();
        }
      })
        .then(async () => {
          try {
            await session.endSession();
          } catch (endSessionError) {
            console.error(
              'Failed to end session transaction.id:',
              transaction.id,
              ' error: ',
              endSessionError,
            );
          }
        })
        .catch((finalError) => {
          console.error(
            'Error during transaction finalization - transaction id:',
            transaction.id,
            ' error: ',
            finalError,
          );
        });
    }

    console.error(
      'Operation failed. Sending error message.....  transaction id:',
      transaction.id,
    );

    const errorObj = {
      result,
      transaction,
      error: error,
    };

    this.sendMessage(
      KafkaTopics.END_TRANSACTIONS_CREDIT_CARD,
      errorObj,
    ).subscribe({
      complete: () => {
        console.log(
          'Operation error message sent successfully - transaction id:',
          transaction.id,
        );
      },
      error: (sendError) => {
        console.error(
          'Failed to send operation error message - transaction id:',
          transaction.id,
          ' error: ',
          sendError,
        );
      },
    });
  }

  // -----------------------------------------------------------------

  private async stopConsumer() {
    await this.kafkaConsumer.disconnect();
  }
}
