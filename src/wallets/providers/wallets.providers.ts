import { DataSource } from 'typeorm';
import { Wallet } from '../entities/wallet.entity';

export const walletsProviders = [
  {
    provide: 'WALLET_REPOSITORY',
    useFactory: (dataSource: DataSource) => dataSource.getRepository(Wallet),
    inject: ['DATA_SOURCE'],
  },
];
