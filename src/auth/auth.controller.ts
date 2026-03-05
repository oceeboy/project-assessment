import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthRegisterDto, AuthLoginDto } from './dtos/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @HttpCode(HttpStatus.CREATED)
  @Post('register')
  register(@Body() registerDto: AuthRegisterDto) {
    return this.authService.registerUser(registerDto);
  }
  @HttpCode(HttpStatus.CREATED)
  @Post('login')
  login(@Body() registerDto: AuthLoginDto) {
    return this.authService.loginUser(registerDto);
  }
}
