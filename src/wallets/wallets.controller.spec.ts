import { Test, TestingModule } from '@nestjs/testing';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';
import { AuthGuard } from '@nestjs/passport';
import { ThrottlerGuard } from '@nestjs/throttler';

// ─── Mock data ───────────────────────────────────────────────────────────────

const mockUser: UserPayload = {
  id: 'user-uuid',
  email: 'john@example.com',
  role: 'user',
};

const mockWalletResponse = {
  success: true,
  message: 'Wallet details',
  data: {
    id: 'wallet-uuid',
    balance: '500.00',
    currency: 'NGN',
  },
};

// ─── Service mock ─────────────────────────────────────────────────────────────

const mockWalletsService = {
  userWallet: jest.fn(),
};

// ─────────────────────────────────────────────────────────────────────────────

describe('WalletsController', () => {
  let controller: WalletsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WalletsController],
      providers: [{ provide: WalletsService, useValue: mockWalletsService }],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({ canActivate: () => true })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WalletsController>(WalletsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // userWallet
  // ───────────────────────────────────────────────────────────────────────────
  describe('userWallet', () => {
    const mockReq = { user: mockUser } as any;

    it('should call walletsService.userWallet with userId from req.user and return the result', async () => {
      mockWalletsService.userWallet.mockResolvedValue(mockWalletResponse);

      const result = await controller.userWallet(mockReq);

      expect(mockWalletsService.userWallet).toHaveBeenCalledWith({
        userId: 'user-uuid',
      });
      expect(result).toEqual(mockWalletResponse);
    });

    it('should extract userId from req.user only', async () => {
      mockWalletsService.userWallet.mockResolvedValue(mockWalletResponse);

      await controller.userWallet(mockReq);

      const callArg = mockWalletsService.userWallet.mock.calls[0][0];
      expect(callArg).toEqual({ userId: 'user-uuid' });
      expect(callArg).not.toHaveProperty('email');
      expect(callArg).not.toHaveProperty('role');
    });

    it('should call userWallet exactly once per request', async () => {
      mockWalletsService.userWallet.mockResolvedValue(mockWalletResponse);

      await controller.userWallet(mockReq);

      expect(mockWalletsService.userWallet).toHaveBeenCalledTimes(1);
    });

    it('should propagate errors thrown by walletsService.userWallet', async () => {
      mockWalletsService.userWallet.mockRejectedValue(
        new Error('Wallet not found'),
      );

      await expect(controller.userWallet(mockReq)).rejects.toThrow(
        'Wallet not found',
      );
    });

    it('should return the correct wallet response shape', async () => {
      mockWalletsService.userWallet.mockResolvedValue(mockWalletResponse);

      const result = await controller.userWallet(mockReq);

      expect(result).toMatchObject({
        success: true,
        message: 'Wallet details',
        data: expect.objectContaining({
          id: expect.any(String),
          balance: expect.any(String),
          currency: expect.any(String),
        }),
      });
    });
  });
});
