import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { WalletsService } from './wallets.service';

@Controller('wallet')
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  async userWallet(@Req() req: Request & { user: UserPayload }) {
    const user = req.user;

    return await this.walletsService.userWallet({ userId: user.id });
  }
}
