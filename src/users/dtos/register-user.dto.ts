import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterUserDto {
  @ApiProperty({
    description: 'The email address of the user',
    example: 'john.doe@example.com',
    format: 'email',
  })
  @IsEmail()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;

  @ApiProperty({
    description: 'The password for the user account',
    example: 'P@ssw0rd!',
    minLength: 8,
    format: 'password',
  })
  @IsString()
  @MinLength(8)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  password: string;
}
