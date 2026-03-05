import { DataSource } from 'typeorm';

export const queryrunnerProviders = [
  {
    provide: 'QUERY_RUNNER',
    useFactory: (dataSource: DataSource) => dataSource.createQueryRunner(),
    inject: ['DATA_SOURCE'],
  },
];
