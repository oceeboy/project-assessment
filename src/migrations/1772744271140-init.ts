import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1772744271140 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE users (
        id varchar(36) PRIMARY KEY,
        email varchar(255) NOT NULL UNIQUE,
        createdAt timestamp DEFAULT CURRENT_TIMESTAMP,
        updatedAt timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    await queryRunner.query(`
      CREATE TABLE wallets (
        id varchar(36) PRIMARY KEY,
        userId varchar(36) NOT NULL,
        balance decimal(18,2) NOT NULL DEFAULT 0,
        currency varchar(10) NOT NULL,
        createdAt timestamp DEFAULT CURRENT_TIMESTAMP,
        updatedAt timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT FK_wallet_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE transactions (
        id varchar(36) PRIMARY KEY,
        reference varchar(255) NOT NULL UNIQUE,
        walletId varchar(36) NOT NULL,
        type varchar(10) NOT NULL,
        amount decimal(18,2) NOT NULL,
        status varchar(20) NOT NULL,
        idempotencyKey varchar(255) NOT NULL UNIQUE,
        createdAt timestamp DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT FK_transaction_wallet FOREIGN KEY (walletId) REFERENCES wallets(id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IDX_wallet_userId ON wallets(userId)`,
    );
    await queryRunner.query(
      `CREATE INDEX IDX_transaction_walletId ON transactions(walletId)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS transactions`);
    await queryRunner.query(`DROP TABLE IF EXISTS wallets`);
    await queryRunner.query(`DROP TABLE IF EXISTS users`);
  }
}
