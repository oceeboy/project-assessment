import { ApiProperty } from '@nestjs/swagger';
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
  @ApiProperty({
    description: 'The transaction amount',
    example: 100.5,
    minimum: 0,
  })
  @IsNumber()
  amount: number;

  @ApiProperty({
    description: 'The type of transaction',
    enum: TransactionType,
    example: TransactionType.CREDIT,
  })
  @IsString()
  @IsEnum(TransactionType)
  type: TransactionType;

  @ApiProperty({
    description: 'Unique key to prevent duplicate transactions',
    example: '12345678901',
    minLength: 11,
  })
  @IsString()
  @MinLength(11)
  idempotencyKey: string;
}
