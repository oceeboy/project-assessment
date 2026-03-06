import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { WalletsService } from '../wallets/wallets.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

// ─── Mock data ───────────────────────────────────────────────────────────────

const mockUser = {
  id: 'user-uuid',
  email: 'john@example.com',
  role: 'user',
  createdAt: new Date('2024-01-01'),
};

const mockWallet = {
  savedWallet: {
    id: 'wallet-uuid',
    currency: 'NGN',
    balance: '0.00',
  },
};

const mockTokens = {
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
};

// ─── Service mocks ───────────────────────────────────────────────────────────

const mockUsersService = {
  registerUser: jest.fn(),
  validateUser: jest.fn(),
  userProfile: jest.fn(),
};

const mockWalletsService = {
  createWallet: jest.fn(),
};

const mockJwtService = {
  signAsync: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    if (key === 'JWT_SECRET') return 'test-secret';
    if (key === 'JWT_REFRESH_SECRET') return 'test-refresh-secret';
  }),
};

// ─────────────────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: WalletsService, useValue: mockWalletsService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);

    // default token behaviour for all tests
    mockJwtService.signAsync
      .mockResolvedValueOnce(mockTokens.access_token)
      .mockResolvedValueOnce(mockTokens.refresh_token);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // registerUser
  // ───────────────────────────────────────────────────────────────────────────
  describe('registerUser', () => {
    const dto = { email: 'john@example.com', password: 'secret123' };

    it('should register a user, create a wallet, and return tokens + user + wallet data', async () => {
      mockUsersService.registerUser.mockResolvedValue(mockUser);
      mockWalletsService.createWallet.mockResolvedValue(mockWallet);

      const result = await service.registerUser(dto);

      expect(mockUsersService.registerUser).toHaveBeenCalledWith(dto);
      expect(mockWalletsService.createWallet).toHaveBeenCalledWith({
        userId: mockUser.id,
      });

      expect(result).toEqual({
        success: true,
        message: 'User registered successfully',
        data: {
          user: {
            id: mockUser.id,
            email: mockUser.email,
            role: mockUser.role,
          },
          tokens: {
            access_token: mockTokens.access_token,
            refresh_token: mockTokens.refresh_token,
          },
          wallet: {
            id: mockWallet.savedWallet.id,
            currency: mockWallet.savedWallet.currency,
            balance: mockWallet.savedWallet.balance,
          },
        },
      });
    });

    it('should call signAsync twice — once for access token, once for refresh token', async () => {
      mockUsersService.registerUser.mockResolvedValue(mockUser);
      mockWalletsService.createWallet.mockResolvedValue(mockWallet);

      await service.registerUser(dto);

      expect(mockJwtService.signAsync).toHaveBeenCalledTimes(2);
    });

    it('should sign access token with JWT_SECRET and 15m expiry', async () => {
      mockUsersService.registerUser.mockResolvedValue(mockUser);
      mockWalletsService.createWallet.mockResolvedValue(mockWallet);

      await service.registerUser(dto);

      expect(mockJwtService.signAsync).toHaveBeenNthCalledWith(
        1,
        { sub: mockUser.id, email: mockUser.email, role: mockUser.role },
        { expiresIn: '15m', secret: 'test-secret' },
      );
    });

    it('should sign refresh token with JWT_REFRESH_SECRET and 1d expiry', async () => {
      mockUsersService.registerUser.mockResolvedValue(mockUser);
      mockWalletsService.createWallet.mockResolvedValue(mockWallet);

      await service.registerUser(dto);

      expect(mockJwtService.signAsync).toHaveBeenNthCalledWith(
        2,
        { sub: mockUser.id, email: mockUser.email, role: mockUser.role },
        { expiresIn: '1d', secret: 'test-refresh-secret' },
      );
    });

    it('should propagate error if usersService.registerUser throws', async () => {
      mockUsersService.registerUser.mockRejectedValue(
        new Error('Registration failed'),
      );

      await expect(service.registerUser(dto)).rejects.toThrow(
        'Registration failed',
      );

      expect(mockWalletsService.createWallet).not.toHaveBeenCalled();
    });

    it('should propagate error if walletsService.createWallet throws', async () => {
      mockUsersService.registerUser.mockResolvedValue(mockUser);
      mockWalletsService.createWallet.mockRejectedValue(
        new Error('Wallet error'),
      );

      await expect(service.registerUser(dto)).rejects.toThrow('Wallet error');
    });

    it('should not expose password or createdAt in the response', async () => {
      mockUsersService.registerUser.mockResolvedValue(mockUser);
      mockWalletsService.createWallet.mockResolvedValue(mockWallet);

      const result = await service.registerUser(dto);

      expect(result.data.user).not.toHaveProperty('password');
      expect(result.data.user).not.toHaveProperty('createdAt');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // loginUser
  // ───────────────────────────────────────────────────────────────────────────
  describe('loginUser', () => {
    const dto = { email: 'john@example.com', password: 'secret123' };

    it('should validate credentials and return tokens + user data', async () => {
      mockUsersService.validateUser.mockResolvedValue(mockUser);

      const result = await service.loginUser(dto);

      expect(mockUsersService.validateUser).toHaveBeenCalledWith(dto);

      expect(result).toEqual({
        success: true,
        message: 'Successfully logged in',
        data: {
          user: {
            id: mockUser.id,
            email: mockUser.email,
            role: mockUser.role,
          },
          tokens: {
            access_token: mockTokens.access_token,
            refresh_token: mockTokens.refresh_token,
          },
        },
      });
    });

    it('should not create a wallet on login', async () => {
      mockUsersService.validateUser.mockResolvedValue(mockUser);

      await service.loginUser(dto);

      expect(mockWalletsService.createWallet).not.toHaveBeenCalled();
    });

    it('should sign both access and refresh tokens on login', async () => {
      mockUsersService.validateUser.mockResolvedValue(mockUser);

      await service.loginUser(dto);

      expect(mockJwtService.signAsync).toHaveBeenCalledTimes(2);
    });

    it('should propagate error if validateUser throws', async () => {
      mockUsersService.validateUser.mockRejectedValue(
        new Error('Invalid credentials'),
      );

      await expect(service.loginUser(dto)).rejects.toThrow(
        'Invalid credentials',
      );

      expect(mockJwtService.signAsync).not.toHaveBeenCalled();
    });

    it('should not expose password in the login response', async () => {
      mockUsersService.validateUser.mockResolvedValue(mockUser);

      const result = await service.loginUser(dto);

      expect(result.data.user).not.toHaveProperty('password');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // refreshToken
  // ───────────────────────────────────────────────────────────────────────────
  describe('refreshToken', () => {
    const input = { userId: 'user-uuid' };

    it('should return a new access token for a valid user', async () => {
      mockUsersService.userProfile.mockResolvedValue(mockUser);

      const result = await service.refreshToken(input);

      expect(mockUsersService.userProfile).toHaveBeenCalledWith({
        userId: 'user-uuid',
      });

      expect(result).toEqual({
        success: true,
        message: 'New Access token',
        token: {
          access_token: mockTokens.access_token,
        },
      });
    });

    it('should only return access_token — not a refresh_token', async () => {
      mockUsersService.userProfile.mockResolvedValue(mockUser);

      const result = await service.refreshToken(input);

      expect(result.token).toHaveProperty('access_token');
      expect(result.token).not.toHaveProperty('refresh_token');
    });

    it('should sign the token with the correct payload', async () => {
      mockUsersService.userProfile.mockResolvedValue(mockUser);

      await service.refreshToken(input);

      expect(mockJwtService.signAsync).toHaveBeenNthCalledWith(
        1,
        { sub: mockUser.id, email: mockUser.email, role: mockUser.role },
        { expiresIn: '15m', secret: 'test-secret' },
      );
    });

    it('should propagate error if userProfile throws', async () => {
      mockUsersService.userProfile.mockRejectedValue(
        new Error('User not found'),
      );

      await expect(service.refreshToken(input)).rejects.toThrow(
        'User not found',
      );

      expect(mockJwtService.signAsync).not.toHaveBeenCalled();
    });
  });
});
