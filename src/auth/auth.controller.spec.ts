import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from '@nestjs/passport';
import { ThrottlerGuard } from '@nestjs/throttler';

// ─── Mock data ───────────────────────────────────────────────────────────────

const mockAuthResponse = {
  success: true,
  message: 'User registered successfully',
  data: {
    user: { id: 'user-uuid', email: 'john@example.com', role: 'user' },
    tokens: {
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
    },
    wallet: { id: 'wallet-uuid', currency: 'NGN', balance: '0.00' },
  },
};

const mockLoginResponse = {
  success: true,
  message: 'Successfully logged in',
  data: {
    user: { id: 'user-uuid', email: 'john@example.com', role: 'user' },
    tokens: {
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
    },
  },
};

const mockRefreshResponse = {
  success: true,
  message: 'New Access token',
  token: { access_token: 'new-mock-access-token' },
};

// ─── Service mock ─────────────────────────────────────────────────────────────

const mockAuthService = {
  registerUser: jest.fn(),
  loginUser: jest.fn(),
  refreshToken: jest.fn(),
};

// ─────────────────────────────────────────────────────────────────────────────

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    })
      // bypass guards in unit tests
      .overrideGuard(AuthGuard('jwt-refresh'))
      .useValue({ canActivate: () => true })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // register
  // ───────────────────────────────────────────────────────────────────────────
  describe('register', () => {
    const dto = { email: 'john@example.com', password: 'secret123' };

    it('should call authService.registerUser with the request body and return its result', async () => {
      mockAuthService.registerUser.mockResolvedValue(mockAuthResponse);

      const result = await controller.register(dto);

      expect(mockAuthService.registerUser).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockAuthResponse);
    });

    it('should propagate errors thrown by authService.registerUser', async () => {
      mockAuthService.registerUser.mockRejectedValue(new Error('Conflict'));

      await expect(controller.register(dto)).rejects.toThrow('Conflict');
    });

    it('should call registerUser exactly once per request', async () => {
      mockAuthService.registerUser.mockResolvedValue(mockAuthResponse);

      await controller.register(dto);

      expect(mockAuthService.registerUser).toHaveBeenCalledTimes(1);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // login
  // ───────────────────────────────────────────────────────────────────────────
  describe('login', () => {
    const dto = { email: 'john@example.com', password: 'secret123' };

    it('should call authService.loginUser with the request body and return its result', async () => {
      mockAuthService.loginUser.mockResolvedValue(mockLoginResponse);

      const result = await controller.login(dto);

      expect(mockAuthService.loginUser).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockLoginResponse);
    });

    it('should propagate errors thrown by authService.loginUser', async () => {
      mockAuthService.loginUser.mockRejectedValue(
        new Error('Invalid credentials'),
      );

      await expect(controller.login(dto)).rejects.toThrow(
        'Invalid credentials',
      );
    });

    it('should call loginUser exactly once per request', async () => {
      mockAuthService.loginUser.mockResolvedValue(mockLoginResponse);

      await controller.login(dto);

      expect(mockAuthService.loginUser).toHaveBeenCalledTimes(1);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // refreshToken
  // ───────────────────────────────────────────────────────────────────────────
  describe('refreshToken', () => {
    const mockRequest = {
      user: { id: 'user-uuid', email: 'john@example.com', role: 'user' },
    } as any;

    it('should call authService.refreshToken with userId from req.user and return its result', async () => {
      mockAuthService.refreshToken.mockResolvedValue(mockRefreshResponse);

      const result = await controller.refreshToken(mockRequest);

      expect(mockAuthService.refreshToken).toHaveBeenCalledWith({
        userId: 'user-uuid',
      });
      expect(result).toEqual(mockRefreshResponse);
    });

    it('should extract userId from req.user — not from the body', async () => {
      mockAuthService.refreshToken.mockResolvedValue(mockRefreshResponse);

      await controller.refreshToken(mockRequest);

      const callArg = mockAuthService.refreshToken.mock.calls[0][0];
      expect(callArg).toEqual({ userId: 'user-uuid' });
      expect(callArg).not.toHaveProperty('email');
      expect(callArg).not.toHaveProperty('role');
    });

    it('should propagate errors thrown by authService.refreshToken', async () => {
      mockAuthService.refreshToken.mockRejectedValue(
        new Error('User not found'),
      );

      await expect(controller.refreshToken(mockRequest)).rejects.toThrow(
        'User not found',
      );
    });

    it('should call refreshToken exactly once per request', async () => {
      mockAuthService.refreshToken.mockResolvedValue(mockRefreshResponse);

      await controller.refreshToken(mockRequest);

      expect(mockAuthService.refreshToken).toHaveBeenCalledTimes(1);
    });
  });
});
