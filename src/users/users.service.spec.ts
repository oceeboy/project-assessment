import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

const mockUserRepository = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

const mockUser = {
  id: 'uuid-123',
  email: 'john@example.com',
  password: 'hashed_password',
  role: 'user',
  createdAt: new Date('2024-01-01'),
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: 'USER_REPOSITORY',
          useValue: mockUserRepository,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────
  // registerUser
  // ─────────────────────────────────────────────
  describe('registerUser', () => {
    const registerDto = {
      email: '  John@Example.COM  ',
      password: 'secret123',
    };

    it('should register a new user and return safe fields', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue(mockUser);
      mockUserRepository.save.mockResolvedValue(mockUser);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');

      const result = await service.registerUser(registerDto);

      // email must be normalized before the duplicate-check
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { email: 'john@example.com' },
      });

      expect(bcrypt.hash).toHaveBeenCalledWith('secret123', 10);

      expect(mockUserRepository.create).toHaveBeenCalledWith({
        email: 'john@example.com',
        password: 'hashed_password',
      });

      expect(result).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
        createdAt: mockUser.createdAt,
      });

      // password must NOT be in the returned object
      expect(result).not.toHaveProperty('password');
    });

    it('should throw ConflictException when email already exists', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);

      await expect(service.registerUser(registerDto)).rejects.toThrow(
        new ConflictException('User email already exists'),
      );

      expect(mockUserRepository.create).not.toHaveBeenCalled();
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when email is empty', async () => {
      await expect(
        service.registerUser({ email: '   ', password: 'secret123' }),
      ).rejects.toThrow(new BadRequestException('Email is required'));
    });

    it('should throw BadRequestException when email is not a string', async () => {
      await expect(
        service.registerUser({ email: null as any, password: 'secret123' }),
      ).rejects.toThrow(new BadRequestException('Email is required'));
    });

    it('should trim and lowercase email before saving', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue(mockUser);
      mockUserRepository.save.mockResolvedValue(mockUser);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');

      await service.registerUser({
        email: '  UPPER@CASE.COM  ',
        password: 'pw',
      });

      expect(mockUserRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'upper@case.com' }),
      );
    });
  });

  // ─────────────────────────────────────────────
  // validateUser
  // ─────────────────────────────────────────────
  describe('validateUser', () => {
    const credentials = { email: 'john@example.com', password: 'secret123' };

    it('should return user data when credentials are valid', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser(credentials);

      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { email: 'john@example.com' },
        select: ['id', 'email', 'password', 'role'],
      });

      expect(bcrypt.compare).toHaveBeenCalledWith(
        'secret123',
        mockUser.password,
      );

      expect(result).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
      });

      expect(result).not.toHaveProperty('password');
    });

    it('should throw BadRequestException when user is not found', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.validateUser(credentials)).rejects.toThrow(
        new BadRequestException('Invalid credentials'),
      );

      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when password does not match', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.validateUser(credentials)).rejects.toThrow(
        new BadRequestException('Invalid credentials'),
      );
    });

    it('should normalize email before querying', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.validateUser({
        email: '  JOHN@EXAMPLE.COM  ',
        password: 'secret123',
      });

      expect(mockUserRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 'john@example.com' } }),
      );
    });

    it('should throw BadRequestException when email is empty', async () => {
      await expect(
        service.validateUser({ email: '', password: 'secret123' }),
      ).rejects.toThrow(new BadRequestException('Email is required'));
    });
  });

  // ─────────────────────────────────────────────
  // userProfile
  // ─────────────────────────────────────────────
  describe('userProfile', () => {
    it('should return the user profile for a valid userId', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.userProfile({ userId: 'uuid-123' });

      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'uuid-123' },
      });

      expect(result).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
      });

      expect(result).not.toHaveProperty('password');
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(
        service.userProfile({ userId: 'non-existent' }),
      ).rejects.toThrow(new NotFoundException('User not found'));
    });
  });
});
