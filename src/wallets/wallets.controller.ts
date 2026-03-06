import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { WalletsService } from './wallets.service';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('Wallet')
@Controller('wallet')
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @ApiOperation({ summary: 'Get authenticated user wallet' })
  @ApiResponse({
    status: 200,
    description: 'Returns the wallet details of the authenticated user',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Get()
  @UseGuards(AuthGuard('jwt'))
  async userWallet(@Req() req: Request & { user: UserPayload }) {
    const user = req.user;

    return await this.walletsService.userWallet({ userId: user.id });
  }
}
