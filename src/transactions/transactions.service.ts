import {
  Injectable,
  BadRequestException,
  ConflictException,
  Inject,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { Wallet } from '../wallets/entities/wallet.entity';
import {
  TransactionStatus,
  TransactionType,
  Transaction,
} from './entities/transaction.entity';

@Injectable()
export class TransactionsService {
  constructor(@Inject('DATA_SOURCE') private readonly dataSource: DataSource) {}

  async processTransaction({
    userId,
    amount,
    type,
    idempotencyKey,
  }: {
    userId: string;
    amount: number;
    type: TransactionType;
    idempotencyKey: string;
  }) {
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    const manager = queryRunner.manager;
    const transactionRepo = manager.getRepository(Transaction);
    const walletRepo = manager.getRepository(Wallet);

    try {
      // 1. Check idempotency
      const existing = await transactionRepo.findOne({
        where: { idempotencyKey },
      });

      if (existing) {
        await queryRunner.rollbackTransaction();
        return existing;
      }

      // 2. Lock wallet row
      const wallet = await walletRepo.findOne({
        where: { userId: userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        throw new BadRequestException('Wallet not found');
      }

      const numericBalance = Number(wallet.balance);

      if (type === TransactionType.DEBIT && numericBalance < amount) {
        throw new ConflictException('Insufficient funds');
      }

      const reference = `TXN_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      const transaction = transactionRepo.create({
        walletId: wallet.id,
        amount: amount.toString(),
        type,
        reference,
        idempotencyKey,
        status: TransactionStatus.PENDING,
      });

      await transactionRepo.save(transaction);

      // Update balance
      if (type === TransactionType.DEBIT) {
        wallet.balance = (numericBalance - amount).toString();
      } else {
        wallet.balance = (numericBalance + amount).toString();
      }

      await walletRepo.save(wallet);

      transaction.status = TransactionStatus.SUCCESS;
      await transactionRepo.save(transaction);

      await queryRunner.commitTransaction();

      return transaction;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getTransationsByUser({
    userId,
    page = 1,
    limit = 10,
  }: {
    userId: string;
    page?: number;
    limit?: number;
  }) {
    const transactionRepo = this.dataSource.getRepository(Transaction);
    const walletRepo = this.dataSource.getRepository(Wallet);

    const wallet = await walletRepo.findOne({
      where: { userId },
    });

    if (!wallet) {
      throw new BadRequestException('Wallet not found');
    }
    const safeLimit = Math.min(limit, 50);
    const skip = (page - 1) * safeLimit;

    const [transactions, total] = await transactionRepo.findAndCount({
      where: { walletId: wallet.id },
      order: { createdAt: 'DESC' },
      skip,
      take: safeLimit,
    });

    return {
      walletId: wallet.id,
      balance: wallet.balance,
      page,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
      transactions,
    };
  }
}
