import { forwardRef, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersModule } from '../users/users.module';
import { WalletsModule } from 'src/wallets/wallets.module';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy, RefreshStrategy } from './strategy';

@Module({
  imports: [
    JwtModule.register({ secret: process.env.JWT_SECRET }),
    UsersModule,
    WalletsModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RefreshStrategy],
})
export class AuthModule {}
