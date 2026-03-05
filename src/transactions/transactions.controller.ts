import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CreateTransaction } from './dtos/transaction-create.dto';
import { TransactionsService } from './transactions.service';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionService: TransactionsService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'))
  async createTrans(
    @Body() dto: CreateTransaction,
    @Req() req: Request & { user: UserPayload },
  ) {
    const user = req.user;

    return await this.transactionService.processTransaction({
      userId: user.id,
      ...dto,
    });
  }

  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Get()
  @UseGuards(AuthGuard('jwt'))
  async getTransactionsByUserId(
    @Req() req: Request & { user: UserPayload },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const user = req.user;

    const parsedPage = page ? parseInt(page, 10) : 1;
    const parsedLimit = limit ? parseInt(limit, 10) : 10;

    return this.transactionService.getTransationsByUser({
      userId: user.id,
      page: parsedPage,
      limit: parsedLimit,
    });
  }
}
