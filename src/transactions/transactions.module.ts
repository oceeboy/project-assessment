import { Module } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { DatabaseModule } from '../database/database.module';
import { transactionsProviders } from './providers/transactions.providers';
import { walletsProviders } from '../wallets/providers/wallets.providers';
import { TransactionsController } from './transactions.controller';
import { queryrunnerProviders } from './providers/queryrunner.providers';

@Module({
  imports: [DatabaseModule],
  providers: [
    TransactionsService,
    ...transactionsProviders,
    ...walletsProviders,
    ...queryrunnerProviders,
  ],
  controllers: [TransactionsController],
})
export class TransactionsModule {}
