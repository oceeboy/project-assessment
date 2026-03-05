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
import type { Request } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @Post('register')
  async register(@Body() registerDto: AuthRegisterDto) {
    return await this.authService.registerUser(registerDto);
  }
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @Post('login')
  async login(@Body() registerDto: AuthLoginDto) {
    return await this.authService.loginUser(registerDto);
  }

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
