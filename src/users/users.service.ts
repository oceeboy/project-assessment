import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { RegisterUserDto } from './dtos';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    @Inject('USER_REPOSITORY')
    private userRepository: Repository<User>,
  ) {}

  // utility to normalize email
  private normalizeEmail(email: string) {
    if (typeof email !== 'string' || email.trim().length === 0) {
      throw new BadRequestException('Email is required');
    }
    return email.trim().toLowerCase();
  }

  // create a user record

  async registerUser(dto: RegisterUserDto) {
    const { email, password } = dto;

    const normalizedEmail = this.normalizeEmail(email);

    // check if user email exisit.

    const existingUser = await this.userRepository.findOne({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new ConflictException('User email already exists');
    }

    // create user
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = this.userRepository.create({
      email: normalizedEmail,
      password: hashedPassword,
    });

    const savedUser = await this.userRepository.save(user);

    return {
      id: savedUser.id,
      email: savedUser.email,
      role: savedUser.role,
      createdAt: savedUser.createdAt,
    };
  }

  async validateUser({ email, password }: { email: string; password: string }) {
    const normalizedEmail = this.normalizeEmail(email);

    const user = await this.userRepository.findOne({
      where: { email: normalizedEmail },
      select: ['id', 'email', 'password', 'role'],
    });

    if (!user) {
      throw new BadRequestException('Invalid credentials');
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      throw new BadRequestException('Invalid credentials');
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
    };
  }

  async userProfile({ userId }: { userId: string }) {
    // check if true
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found');

    return {
      id: user.id,
      email: user.email,
      role: user.role,
    };
  }
}
