import {
  IsDecimal,
  IsEnum,
  IsNumber,
  IsString,
  MinLength,
} from 'class-validator';

enum TransactionType {
  CREDIT = 'credit',
  DEBIT = 'debit',
}

export class CreateTransaction {
  @IsNumber()
  amount: number;

  @IsString()
  @IsEnum(TransactionType)
  type: TransactionType;

  @IsString()
  @MinLength(11)
  idempotencyKey: string;
}
