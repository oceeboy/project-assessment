import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('Transactions')
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionService: TransactionsService) {}

  @ApiOperation({ summary: 'Create a new transaction' })
  @ApiResponse({
    status: 201,
    description: 'Transaction successfully created and processed',
  })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiBearerAuth()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
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

  @ApiOperation({
    summary: 'Get paginated transactions for authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns a paginated list of transactions for the user',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (defaults to 1)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of results per page (defaults to 10)',
    example: 10,
  })
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
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
