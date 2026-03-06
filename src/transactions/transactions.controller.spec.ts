import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { AuthGuard } from '@nestjs/passport';
import { ThrottlerGuard } from '@nestjs/throttler';
import { TransactionType } from './entities/transaction.entity';

// ─── Mock data ───────────────────────────────────────────────────────────────

const mockUser: UserPayload = {
  id: 'user-uuid',
  email: 'john@example.com',
  role: 'user',
};

const mockTransactionResult = {
  id: 'txn-uuid',
  walletId: 'wallet-uuid',
  amount: '100',
  type: TransactionType.CREDIT,
  reference: 'TXN_123_456',
  idempotencyKey: 'idem-key-001',
  status: 'SUCCESS',
  createdAt: new Date('2024-01-01'),
};

const mockPaginatedResult = {
  walletId: 'wallet-uuid',
  balance: '500.00',
  page: 1,
  limit: 10,
  total: 1,
  totalPages: 1,
  transactions: [mockTransactionResult],
};

// ─── Service mock ─────────────────────────────────────────────────────────────

const mockTransactionsService = {
  processTransaction: jest.fn(),
  getTransationsByUser: jest.fn(),
};

// ─────────────────────────────────────────────────────────────────────────────

describe('TransactionsController', () => {
  let controller: TransactionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransactionsController],
      providers: [
        { provide: TransactionsService, useValue: mockTransactionsService },
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({ canActivate: () => true })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TransactionsController>(TransactionsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // createTrans
  // ───────────────────────────────────────────────────────────────────────────
  describe('createTrans', () => {
    const dto = {
      amount: 100,
      type: TransactionType.CREDIT,
      idempotencyKey: 'idem-key-001',
    };

    const mockReq = { user: mockUser } as any;

    it('should call processTransaction with userId from req.user merged with the dto', async () => {
      mockTransactionsService.processTransaction.mockResolvedValue(
        mockTransactionResult,
      );

      const result = await controller.createTrans(dto, mockReq);

      expect(mockTransactionsService.processTransaction).toHaveBeenCalledWith({
        userId: mockUser.id,
        ...dto,
      });
      expect(result).toEqual(mockTransactionResult);
    });

    it('should use userId from req.user — not from the body', async () => {
      mockTransactionsService.processTransaction.mockResolvedValue(
        mockTransactionResult,
      );

      await controller.createTrans(dto, mockReq);

      const callArg =
        mockTransactionsService.processTransaction.mock.calls[0][0];
      expect(callArg.userId).toBe('user-uuid');
    });

    it('should call processTransaction exactly once', async () => {
      mockTransactionsService.processTransaction.mockResolvedValue(
        mockTransactionResult,
      );

      await controller.createTrans(dto, mockReq);

      expect(mockTransactionsService.processTransaction).toHaveBeenCalledTimes(
        1,
      );
    });

    it('should propagate errors thrown by processTransaction', async () => {
      mockTransactionsService.processTransaction.mockRejectedValue(
        new Error('Insufficient funds'),
      );

      await expect(controller.createTrans(dto, mockReq)).rejects.toThrow(
        'Insufficient funds',
      );
    });

    it('should work for DEBIT transaction type', async () => {
      const debitDto = { ...dto, type: TransactionType.DEBIT };
      mockTransactionsService.processTransaction.mockResolvedValue({
        ...mockTransactionResult,
        type: TransactionType.DEBIT,
      });

      await controller.createTrans(debitDto, mockReq);

      expect(mockTransactionsService.processTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ type: TransactionType.DEBIT }),
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // getTransactionsByUserId
  // ───────────────────────────────────────────────────────────────────────────
  describe('getTransactionsByUserId', () => {
    const mockReq = { user: mockUser } as any;

    it('should return paginated transactions for the authenticated user', async () => {
      mockTransactionsService.getTransationsByUser.mockResolvedValue(
        mockPaginatedResult,
      );

      const result = await controller.getTransactionsByUserId(
        mockReq,
        '1',
        '10',
      );

      expect(mockTransactionsService.getTransationsByUser).toHaveBeenCalledWith(
        {
          userId: mockUser.id,
          page: 1,
          limit: 10,
        },
      );
      expect(result).toEqual(mockPaginatedResult);
    });

    it('should default to page 1 and limit 10 when query params are not provided', async () => {
      mockTransactionsService.getTransationsByUser.mockResolvedValue(
        mockPaginatedResult,
      );

      await controller.getTransactionsByUserId(mockReq, undefined, undefined);

      expect(mockTransactionsService.getTransationsByUser).toHaveBeenCalledWith(
        {
          userId: mockUser.id,
          page: 1,
          limit: 10,
        },
      );
    });

    it('should parse page and limit from strings to integers', async () => {
      mockTransactionsService.getTransationsByUser.mockResolvedValue(
        mockPaginatedResult,
      );

      await controller.getTransactionsByUserId(mockReq, '3', '25');

      expect(mockTransactionsService.getTransationsByUser).toHaveBeenCalledWith(
        {
          userId: mockUser.id,
          page: 3,
          limit: 25,
        },
      );
    });

    it('should use userId from req.user', async () => {
      mockTransactionsService.getTransationsByUser.mockResolvedValue(
        mockPaginatedResult,
      );

      await controller.getTransactionsByUserId(mockReq, '1', '10');

      const callArg =
        mockTransactionsService.getTransationsByUser.mock.calls[0][0];
      expect(callArg.userId).toBe('user-uuid');
    });

    it('should default to page 1 when only limit is provided', async () => {
      mockTransactionsService.getTransationsByUser.mockResolvedValue(
        mockPaginatedResult,
      );

      await controller.getTransactionsByUserId(mockReq, undefined, '5');

      expect(mockTransactionsService.getTransationsByUser).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, limit: 5 }),
      );
    });

    it('should default to limit 10 when only page is provided', async () => {
      mockTransactionsService.getTransationsByUser.mockResolvedValue(
        mockPaginatedResult,
      );

      await controller.getTransactionsByUserId(mockReq, '2', undefined);

      expect(mockTransactionsService.getTransationsByUser).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2, limit: 10 }),
      );
    });

    it('should propagate errors thrown by getTransationsByUser', async () => {
      mockTransactionsService.getTransationsByUser.mockRejectedValue(
        new Error('Wallet not found'),
      );

      await expect(
        controller.getTransactionsByUserId(mockReq, '1', '10'),
      ).rejects.toThrow('Wallet not found');
    });

    it('should call getTransationsByUser exactly once', async () => {
      mockTransactionsService.getTransationsByUser.mockResolvedValue(
        mockPaginatedResult,
      );

      await controller.getTransactionsByUserId(mockReq, '1', '10');

      expect(
        mockTransactionsService.getTransationsByUser,
      ).toHaveBeenCalledTimes(1);
    });
  });
});
