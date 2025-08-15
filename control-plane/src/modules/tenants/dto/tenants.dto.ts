import { IsString, IsEmail, IsOptional, IsNumber, IsBoolean, IsEnum, MinLength, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTenantDto {
  @ApiProperty({ example: 'Acme Gaming' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'acme.gaming.com' })
  @IsString()
  domain: string;

  @ApiProperty({ required: false, example: 'Gaming company tenant' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false, default: 5, minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxNodes?: number;

  @ApiProperty({ required: false, default: 10, minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxServers?: number;

  @ApiProperty({ required: false, default: 50, minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxUsers?: number;

  @ApiProperty({ required: false, default: 100, minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  storageGb?: number;

  @ApiProperty({ required: false, default: 4096, minimum: 512 })
  @IsOptional()
  @IsNumber()
  @Min(512)
  memoryMb?: number;

  @ApiProperty({ required: false, default: 2, minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  cpuCores?: number;
}

export class UpdateTenantDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  domain?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiProperty({ required: false, minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxNodes?: number;

  @ApiProperty({ required: false, minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxServers?: number;

  @ApiProperty({ required: false, minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxUsers?: number;

  @ApiProperty({ required: false, minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  storageGb?: number;

  @ApiProperty({ required: false, minimum: 512 })
  @IsOptional()
  @IsNumber()
  @Min(512)
  memoryMb?: number;

  @ApiProperty({ required: false, minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  cpuCores?: number;
}

export class InviteTenantAdminDto {
  @ApiProperty({ example: 'admin@acme.gaming.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  name: string;

  @ApiProperty({ enum: ['admin', 'viewer'], default: 'admin' })
  @IsOptional()
  @IsEnum(['admin', 'viewer'])
  role?: string;
}

export class AcceptInviteDto {
  @ApiProperty({ example: 'invite-token-here' })
  @IsString()
  inviteToken: string;

  @ApiProperty({ example: 'newSecurePassword123!' })
  @IsString()
  @MinLength(8)
  newPassword: string;
}