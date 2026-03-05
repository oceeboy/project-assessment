import { Module } from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { walletsProviders } from './providers/wallets.providers';
import { DatabaseModule } from '../database/database.module';
import { WalletsController } from './wallets.controller';

@Module({
  imports: [DatabaseModule],
  providers: [WalletsService, ...walletsProviders],
  exports: [WalletsService],
  controllers: [WalletsController],
})
export class WalletsModule {}
