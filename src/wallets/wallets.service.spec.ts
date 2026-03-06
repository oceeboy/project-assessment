import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { Wallet } from './entities/wallet.entity';

// ─── Mock data ───────────────────────────────────────────────────────────────

const mockWallet: Partial<Wallet> = {
  id: 'wallet-uuid',
  userId: 'user-uuid',
  balance: '0.00',
  currency: 'NGN',
};

// ─── Repository mock ─────────────────────────────────────────────────────────

const mockWalletRepository = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

// ─────────────────────────────────────────────────────────────────────────────

describe('WalletsService', () => {
  let service: WalletsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletsService,
        { provide: 'WALLET_REPOSITORY', useValue: mockWalletRepository },
      ],
    }).compile();

    service = module.get<WalletsService>(WalletsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // createWallet
  // ───────────────────────────────────────────────────────────────────────────
  describe('createWallet', () => {
    const input = { userId: 'user-uuid' };

    it('should create and return a new wallet with default NGN currency and 0.00 balance', async () => {
      mockWalletRepository.findOne.mockResolvedValue(null);
      mockWalletRepository.create.mockReturnValue(mockWallet);
      mockWalletRepository.save.mockResolvedValue(mockWallet);

      const result = await service.createWallet(input);

      expect(mockWalletRepository.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-uuid' },
      });

      expect(mockWalletRepository.create).toHaveBeenCalledWith({
        userId: 'user-uuid',
        currency: 'NGN',
        balance: '0.00',
      });

      expect(mockWalletRepository.save).toHaveBeenCalledWith(mockWallet);

      expect(result).toEqual({ savedWallet: mockWallet });
    });

    it('should throw ConflictException when a wallet already exists for the user', async () => {
      mockWalletRepository.findOne.mockResolvedValue(mockWallet);

      await expect(service.createWallet(input)).rejects.toThrow(
        new ConflictException('Wallet already exists for this user'),
      );

      expect(mockWalletRepository.create).not.toHaveBeenCalled();
      expect(mockWalletRepository.save).not.toHaveBeenCalled();
    });

    it('should always set balance to 0.00 and currency to NGN on creation', async () => {
      mockWalletRepository.findOne.mockResolvedValue(null);
      mockWalletRepository.create.mockReturnValue(mockWallet);
      mockWalletRepository.save.mockResolvedValue(mockWallet);

      await service.createWallet(input);

      expect(mockWalletRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ balance: '0.00', currency: 'NGN' }),
      );
    });

    it('should return the saved wallet inside a savedWallet key', async () => {
      const savedWallet = { ...mockWallet, id: 'new-uuid' };
      mockWalletRepository.findOne.mockResolvedValue(null);
      mockWalletRepository.create.mockReturnValue(savedWallet);
      mockWalletRepository.save.mockResolvedValue(savedWallet);

      const result = await service.createWallet(input);

      expect(result).toHaveProperty('savedWallet');
      expect(result.savedWallet).toEqual(savedWallet);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // userWallet
  // ───────────────────────────────────────────────────────────────────────────
  describe('userWallet', () => {
    const input = { userId: 'user-uuid' };

    it('should return wallet details for a valid user', async () => {
      mockWalletRepository.findOne.mockResolvedValue(mockWallet);

      const result = await service.userWallet(input);

      expect(mockWalletRepository.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-uuid' },
      });

      expect(result).toEqual({
        success: true,
        message: 'Wallet details',
        data: {
          id: mockWallet.id,
          balance: mockWallet.balance,
          currency: mockWallet.currency,
        },
      });
    });

    it('should throw NotFoundException when wallet does not exist', async () => {
      mockWalletRepository.findOne.mockResolvedValue(null);

      await expect(service.userWallet(input)).rejects.toThrow(
        new NotFoundException('Wallet not found'),
      );
    });

    it('should return success: true in the response', async () => {
      mockWalletRepository.findOne.mockResolvedValue(mockWallet);

      const result = await service.userWallet(input);

      expect(result.success).toBe(true);
    });

    it('should only expose id, balance, and currency — not userId or other fields', async () => {
      mockWalletRepository.findOne.mockResolvedValue(mockWallet);

      const result = await service.userWallet(input);

      expect(result.data).not.toHaveProperty('userId');
      expect(result.data).toHaveProperty('id');
      expect(result.data).toHaveProperty('balance');
      expect(result.data).toHaveProperty('currency');
    });
  });
});
