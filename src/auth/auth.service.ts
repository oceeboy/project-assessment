import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { WalletsService } from '../wallets/wallets.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthLoginDto, AuthRegisterDto } from './dtos/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly walletsService: WalletsService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}
  // login logic

  private async signToken(
    userId: string,
    email: string,
    role?: string,
  ): Promise<{
    access_token: string;
    refresh_token: string;
  }> {
    const payload = {
      sub: userId,
      email,
      role,
    };

    const secret = this.config.get<string>('JWT_SECRET');
    const refreshSecret = this.config.get<string>('JWT_REFRESH_SECRET');
    // accessToken
    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: '15m',
      secret: secret,
    });

    // refreshToken

    const refreshToken = await this.jwt.signAsync(payload, {
      expiresIn: '1d',
      secret: refreshSecret,
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
    };
  }

  async registerUser(dto: AuthRegisterDto) {
    const user = await this.usersService.registerUser(dto);

    // create wallet for the new user
    const wallet = await this.walletsService.createWallet({
      userId: user.id,
    });

    // generate authentication tokens
    const { access_token, refresh_token } = await this.signToken(
      String(user.id),
      user.email,
      user.role,
    );

    return {
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
        tokens: {
          access_token,
          refresh_token,
        },
        wallet: {
          id: wallet.savedWallet.id,
          currency: wallet.savedWallet.currency,
          balance: wallet.savedWallet.balance,
        },
      },
    };
  }

  async loginUser(dto: AuthLoginDto) {
    const user = await this.usersService.validateUser(dto);

    const { access_token, refresh_token } = await this.signToken(
      String(user.id),
      user.email,
      user.role,
    );
    return {
      success: true,
      message: 'Successfully logged in',
      data: {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
        tokens: {
          access_token,
          refresh_token,
        },
      },
    };
  }

  async refreshToken({ userId }: { userId: string }) {
    const user = await this.usersService.userProfile({
      userId: userId,
    });

    const { access_token } = await this.signToken(
      String(user.id),
      user.email,
      user.role,
    );

    return {
      success: true,
      message: 'New Access token',
      token: {
        access_token,
      },
    };
  }
}
