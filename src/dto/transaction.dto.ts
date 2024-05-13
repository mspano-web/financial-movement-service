/* 
  transaction.dto.ts
*/

export class TransactionDto {
  credit_card_number: string;
  amount: string;
  destination: string;
  transaction_datetime: string;
  location: string;
  type: string;
  status: string;
  id: string;

  constructor(
    credit_card_number: string,
    amount: string,
    destination: string,
    transaction_datetime: string,
    location: string,
    type: string,
    status: string,
    id: string,
  ) {
    this.credit_card_number = credit_card_number;
    this.amount = amount;
    this.destination = destination;
    this.transaction_datetime = transaction_datetime;
    this.location = location;
    this.type = type;
    this.status = status;
    this.id = id;
  }
}
