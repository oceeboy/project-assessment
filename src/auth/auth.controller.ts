// auth.controller.ts
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthRegisterDto, AuthLoginDto } from './dtos/auth.dto';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: 'Register a new user account' })
  @ApiResponse({
    status: 201,
    description: 'User successfully registered',
  })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @Post('register')
  async register(@Body() registerDto: AuthRegisterDto) {
    return await this.authService.registerUser(registerDto);
  }

  @ApiOperation({ summary: 'Login with existing user credentials' })
  @ApiResponse({
    status: 201,
    description: 'User successfully logged in, returns access & refresh tokens',
  })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @Post('login')
  async login(@Body() loginDto: AuthLoginDto) {
    return await this.authService.loginUser(loginDto);
  }

  @ApiOperation({ summary: 'Refresh access token using a valid refresh token' })
  @ApiResponse({
    status: 201,
    description: 'Returns a new access token',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @Post('refresh-token')
  @UseGuards(AuthGuard('jwt-refresh'))
  async refreshToken(@Req() req: Request & { user: UserPayload }) {
    const user = req.user;
    return await this.authService.refreshToken({
      userId: user.id,
    });
  }
}
