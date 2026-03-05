import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
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
}
