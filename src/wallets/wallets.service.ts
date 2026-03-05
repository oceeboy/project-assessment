import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { Wallet } from './entities/wallet.entity';

@Injectable()
export class WalletsService {
  constructor(
    @Inject('WALLET_REPOSITORY') private walletRepository: Repository<Wallet>,
  ) {}

  // this creates a wallet for a user
  async createWallet({ userId }: { userId: string }) {
    // check if it exising
    const existingWallet = await this.walletRepository.findOne({
      where: { userId },
    });

    if (existingWallet) {
      throw new ConflictException('Wallet already exists for this user');
    }

    const wallet = this.walletRepository.create({
      userId,
      currency: 'NGN',
      balance: '0.00',
    });

    const savedWallet = await this.walletRepository.save(wallet);

    return {
      savedWallet,
    };
  }

  async userWallet({ userId }: { userId: string }) {
    const wallet = await this.walletRepository.findOne({
      where: { userId },
    });

    if (!wallet) throw new NotFoundException('Wallet not found');

    return {
      success: true,
      message: 'Wallet details',
      data: {
        id: wallet.id,
        balance: wallet.balance,
        currency: wallet.currency,
      },
    };
  }
}
