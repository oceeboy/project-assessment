import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import {
  TransactionStatus,
  TransactionType,
  Transaction,
} from './entities/transaction.entity';
import { Wallet } from '../wallets/entities/wallet.entity';

// ─── Shared mock data ────────────────────────────────────────────────────────

const mockWallet: Wallet = {
  id: 'wallet-uuid',
  userId: 'user-uuid',
  balance: '500.00',
} as Wallet;

const mockTransaction: Transaction = {
  id: 'txn-uuid',
  walletId: 'wallet-uuid',
  amount: '100.00',
  type: TransactionType.CREDIT,
  reference: 'TXN_123_456',
  idempotencyKey: 'idem-key-001',
  status: TransactionStatus.SUCCESS,
  createdAt: new Date('2024-01-01'),
} as Transaction;

// ─── Repository mocks ────────────────────────────────────────────────────────

const mockTransactionRepo = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  findAndCount: jest.fn(),
};

const mockWalletRepo = {
  findOne: jest.fn(),
  save: jest.fn(),
};

// ─── QueryRunner mock ────────────────────────────────────────────────────────

const mockQueryRunner = {
  connect: jest.fn(),
  startTransaction: jest.fn(),
  commitTransaction: jest.fn(),
  rollbackTransaction: jest.fn(),
  release: jest.fn(),
  manager: {
    getRepository: jest.fn((entity) => {
      if (entity === Transaction) return mockTransactionRepo;
      if (entity === Wallet) return mockWalletRepo;
    }),
  },
};

// ─── DataSource mock ─────────────────────────────────────────────────────────

const mockDataSource = {
  createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
  getRepository: jest.fn((entity) => {
    if (entity === Transaction) return mockTransactionRepo;
    if (entity === Wallet) return mockWalletRepo;
  }),
};

// ─────────────────────────────────────────────────────────────────────────────

describe('TransactionsService', () => {
  let service: TransactionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: 'DATA_SOURCE', useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // processTransaction
  // ───────────────────────────────────────────────────────────────────────────
  describe('processTransaction', () => {
    const baseInput = {
      userId: 'user-uuid',
      amount: 100,
      type: TransactionType.CREDIT,
      idempotencyKey: 'idem-key-001',
    };

    describe('idempotency', () => {
      it('should return existing transaction and rollback when idempotency key already exists', async () => {
        mockTransactionRepo.findOne.mockResolvedValue(mockTransaction);

        const result = await service.processTransaction(baseInput);

        expect(mockTransactionRepo.findOne).toHaveBeenCalledWith({
          where: { idempotencyKey: 'idem-key-001' },
        });
        expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
        expect(result).toEqual(mockTransaction);
      });
    });

    describe('CREDIT transaction', () => {
      it('should credit the wallet and return a SUCCESS transaction', async () => {
        mockTransactionRepo.findOne.mockResolvedValue(null); // no duplicate
        mockWalletRepo.findOne.mockResolvedValue({
          ...mockWallet,
          balance: '500.00',
        });
        mockTransactionRepo.create.mockReturnValue({
          ...mockTransaction,
          status: TransactionStatus.PENDING,
        });
        mockTransactionRepo.save
          .mockResolvedValueOnce({
            ...mockTransaction,
            status: TransactionStatus.PENDING,
          })
          .mockResolvedValueOnce({
            ...mockTransaction,
            status: TransactionStatus.SUCCESS,
          });
        mockWalletRepo.save.mockResolvedValue({
          ...mockWallet,
          balance: '600.00',
        });

        const result = await service.processTransaction(baseInput);

        // wallet balance should increase by 100
        expect(mockWalletRepo.save).toHaveBeenCalledWith(
          expect.objectContaining({ balance: '600' }),
        );
        expect(mockTransactionRepo.save).toHaveBeenCalledTimes(2);
        expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
        expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
        expect(result.status).toBe(TransactionStatus.SUCCESS);
      });

      it('should create transaction with PENDING status initially', async () => {
        mockTransactionRepo.findOne.mockResolvedValue(null);
        mockWalletRepo.findOne.mockResolvedValue({ ...mockWallet });
        mockTransactionRepo.create.mockReturnValue({
          ...mockTransaction,
          status: TransactionStatus.PENDING,
        });
        mockTransactionRepo.save.mockResolvedValue({ ...mockTransaction });
        mockWalletRepo.save.mockResolvedValue(mockWallet);

        await service.processTransaction(baseInput);

        expect(mockTransactionRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            status: TransactionStatus.PENDING,
            type: TransactionType.CREDIT,
            amount: '100',
            idempotencyKey: 'idem-key-001',
          }),
        );
      });
    });

    describe('DEBIT transaction', () => {
      const debitInput = {
        ...baseInput,
        type: TransactionType.DEBIT,
        amount: 200,
      };

      it('should debit the wallet when balance is sufficient', async () => {
        mockTransactionRepo.findOne.mockResolvedValue(null);
        mockWalletRepo.findOne.mockResolvedValue({
          ...mockWallet,
          balance: '500.00',
        });
        mockTransactionRepo.create.mockReturnValue({
          ...mockTransaction,
          type: TransactionType.DEBIT,
        });
        mockTransactionRepo.save.mockResolvedValue({ ...mockTransaction });
        mockWalletRepo.save.mockResolvedValue({
          ...mockWallet,
          balance: '300.00',
        });

        await service.processTransaction(debitInput);

        expect(mockWalletRepo.save).toHaveBeenCalledWith(
          expect.objectContaining({ balance: '300' }),
        );
        expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      });

      it('should throw ConflictException when balance is insufficient', async () => {
        mockTransactionRepo.findOne.mockResolvedValue(null);
        mockWalletRepo.findOne.mockResolvedValue({
          ...mockWallet,
          balance: '50.00',
        });

        await expect(service.processTransaction(debitInput)).rejects.toThrow(
          new ConflictException('Insufficient funds'),
        );

        expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
      });

      it('should throw ConflictException when balance exactly equals zero and debit is attempted', async () => {
        mockTransactionRepo.findOne.mockResolvedValue(null);
        mockWalletRepo.findOne.mockResolvedValue({
          ...mockWallet,
          balance: '0',
        });

        await expect(
          service.processTransaction({ ...debitInput, amount: 1 }),
        ).rejects.toThrow(ConflictException);
      });

      it('should allow debit when amount exactly equals balance', async () => {
        mockTransactionRepo.findOne.mockResolvedValue(null);
        mockWalletRepo.findOne.mockResolvedValue({
          ...mockWallet,
          balance: '200.00',
        });
        mockTransactionRepo.create.mockReturnValue({ ...mockTransaction });
        mockTransactionRepo.save.mockResolvedValue({ ...mockTransaction });
        mockWalletRepo.save.mockResolvedValue({ ...mockWallet, balance: '0' });

        await expect(
          service.processTransaction(debitInput),
        ).resolves.not.toThrow();

        expect(mockWalletRepo.save).toHaveBeenCalledWith(
          expect.objectContaining({ balance: '0' }),
        );
      });
    });

    describe('wallet not found', () => {
      it('should throw BadRequestException and rollback when wallet does not exist', async () => {
        mockTransactionRepo.findOne.mockResolvedValue(null);
        mockWalletRepo.findOne.mockResolvedValue(null);

        await expect(service.processTransaction(baseInput)).rejects.toThrow(
          new BadRequestException('Wallet not found'),
        );

        expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
      });
    });

    describe('query runner lifecycle', () => {
      it('should always call connect, startTransaction, and release', async () => {
        mockTransactionRepo.findOne.mockResolvedValue(null);
        mockWalletRepo.findOne.mockResolvedValue({ ...mockWallet });
        mockTransactionRepo.create.mockReturnValue(mockTransaction);
        mockTransactionRepo.save.mockResolvedValue(mockTransaction);
        mockWalletRepo.save.mockResolvedValue(mockWallet);

        await service.processTransaction(baseInput);

        expect(mockQueryRunner.connect).toHaveBeenCalled();
        expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
        expect(mockQueryRunner.release).toHaveBeenCalled();
      });

      it('should still release the query runner even when an error is thrown', async () => {
        mockTransactionRepo.findOne.mockResolvedValue(null);
        mockWalletRepo.findOne.mockResolvedValue(null); // triggers error

        await expect(service.processTransaction(baseInput)).rejects.toThrow();

        expect(mockQueryRunner.release).toHaveBeenCalled();
      });

      it('should generate a unique reference string per transaction', async () => {
        mockTransactionRepo.findOne.mockResolvedValue(null);
        mockWalletRepo.findOne.mockResolvedValue({ ...mockWallet });
        mockTransactionRepo.create.mockReturnValue(mockTransaction);
        mockTransactionRepo.save.mockResolvedValue(mockTransaction);
        mockWalletRepo.save.mockResolvedValue(mockWallet);

        await service.processTransaction(baseInput);

        const createCall = mockTransactionRepo.create.mock.calls[0][0];
        expect(createCall.reference).toMatch(/^TXN_\d+_\d+$/);
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // getTransactionsByUser
  // ───────────────────────────────────────────────────────────────────────────
  describe('getTransationsByUser', () => {
    const baseInput = { userId: 'user-uuid' };

    it('should return paginated transactions with wallet info', async () => {
      mockWalletRepo.findOne.mockResolvedValue(mockWallet);
      mockTransactionRepo.findAndCount.mockResolvedValue([
        [mockTransaction],
        1,
      ]);

      const result = await service.getTransationsByUser(baseInput);

      expect(mockWalletRepo.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-uuid' },
      });
      expect(mockTransactionRepo.findAndCount).toHaveBeenCalledWith({
        where: { walletId: mockWallet.id },
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 10,
      });
      expect(result).toEqual({
        walletId: mockWallet.id,
        balance: mockWallet.balance,
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
        transactions: [mockTransaction],
      });
    });

    it('should throw BadRequestException when wallet is not found', async () => {
      mockWalletRepo.findOne.mockResolvedValue(null);

      await expect(service.getTransationsByUser(baseInput)).rejects.toThrow(
        new BadRequestException('Wallet not found'),
      );

      expect(mockTransactionRepo.findAndCount).not.toHaveBeenCalled();
    });

    it('should default to page 1 and limit 10 when not provided', async () => {
      mockWalletRepo.findOne.mockResolvedValue(mockWallet);
      mockTransactionRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.getTransationsByUser({ userId: 'user-uuid' });

      expect(mockTransactionRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );
    });

    it('should cap limit at 50 even if a higher value is provided', async () => {
      mockWalletRepo.findOne.mockResolvedValue(mockWallet);
      mockTransactionRepo.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.getTransationsByUser({
        userId: 'user-uuid',
        limit: 200,
      });

      expect(mockTransactionRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 }),
      );
      expect(result.limit).toBe(50);
    });

    it('should calculate correct skip value for page 3 with limit 5', async () => {
      mockWalletRepo.findOne.mockResolvedValue(mockWallet);
      mockTransactionRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.getTransationsByUser({
        userId: 'user-uuid',
        page: 3,
        limit: 5,
      });

      expect(mockTransactionRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 5 }),
      );
    });

    it('should return correct totalPages based on total count', async () => {
      mockWalletRepo.findOne.mockResolvedValue(mockWallet);
      mockTransactionRepo.findAndCount.mockResolvedValue([[], 25]);

      const result = await service.getTransationsByUser({
        userId: 'user-uuid',
        limit: 10,
      });

      expect(result.totalPages).toBe(3); // Math.ceil(25 / 10)
    });

    it('should return totalPages of 0 when there are no transactions', async () => {
      mockWalletRepo.findOne.mockResolvedValue(mockWallet);
      mockTransactionRepo.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.getTransationsByUser(baseInput);

      expect(result.totalPages).toBe(0);
      expect(result.transactions).toEqual([]);
    });

    it('should order transactions by createdAt DESC', async () => {
      mockWalletRepo.findOne.mockResolvedValue(mockWallet);
      mockTransactionRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.getTransationsByUser(baseInput);

      expect(mockTransactionRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ order: { createdAt: 'DESC' } }),
      );
    });
  });
});
