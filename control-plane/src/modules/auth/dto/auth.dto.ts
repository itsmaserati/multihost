import { IsEmail, IsString, IsOptional, IsEnum, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: '123456', required: false })
  @IsOptional()
  @IsString()
  twoFaCode?: string;

  @ApiProperty({ enum: ['global_admin', 'tenant_admin', 'user'], default: 'global_admin' })
  @IsOptional()
  @IsEnum(['global_admin', 'tenant_admin', 'user'])
  userType?: 'global_admin' | 'tenant_admin' | 'user';
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken: string;
}

export class Enable2FADto {
  @ApiProperty()
  @IsString()
  secret: string;
}

export class Verify2FADto {
  @ApiProperty({ example: '123456' })
  @IsString()
  code: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  currentPassword: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  newPassword: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  twoFaCode?: string;
}