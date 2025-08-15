import { IsString, IsEmail, IsNumber, IsBoolean, IsOptional, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// Pterodactyl API response types
export interface PterodactylUser {
  id: number;
  external_id: string;
  uuid: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  language: string;
  root_admin: boolean;
  '2fa': boolean;
  created_at: string;
  updated_at: string;
}

export interface PterodactylServer {
  id: number;
  external_id: string;
  uuid: string;
  identifier: string;
  node: number;
  name: string;
  description: string;
  status: string;
  suspended: boolean;
  limits: {
    memory: number;
    swap: number;
    disk: number;
    io: number;
    cpu: number;
  };
  feature_limits: {
    databases: number;
    backups: number;
    allocations: number;
  };
  user: number;
  allocation: number;
  egg: number;
  container: {
    startup_command: string;
    image: string;
    installed: boolean;
    environment: Record<string, any>;
  };
  created_at: string;
  updated_at: string;
}

export interface PterodactylNode {
  id: number;
  uuid: string;
  public: boolean;
  name: string;
  description: string;
  location_id: number;
  fqdn: string;
  scheme: string;
  behind_proxy: boolean;
  maintenance_mode: boolean;
  memory: number;
  memory_overallocate: number;
  disk: number;
  disk_overallocate: number;
  upload_size: number;
  daemon_token_id: string;
  daemon_token: string;
  daemon_listen: number;
  daemon_sftp: number;
  daemon_base: string;
  created_at: string;
  updated_at: string;
}

export interface PterodactylLocation {
  id: number;
  short: string;
  long: string;
  created_at: string;
  updated_at: string;
}

export interface PterodactylAllocation {
  id: number;
  ip: string;
  alias: string;
  port: number;
  notes: string;
  assigned: boolean;
}

export interface PterodactylEgg {
  id: number;
  uuid: string;
  name: string;
  nest: number;
  author: string;
  description: string;
  docker_image: string;
  config: {
    files: Record<string, any>;
    startup: Record<string, any>;
    stop: string;
    logs: Record<string, any>;
    file_denylist: string[];
  };
  startup: string;
  environment: PterodactylEggVariable[];
  script: {
    privileged: boolean;
    install: string;
    entry: string;
    container: string;
    extends: string;
  };
  created_at: string;
  updated_at: string;
}

export interface PterodactylEggVariable {
  name: string;
  description: string;
  env_variable: string;
  default_value: string;
  server_value: string;
  is_editable: boolean;
  rules: string;
}

// Create DTOs
export class CreateUserDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  username: string;

  @ApiProperty()
  @IsString()
  first_name: string;

  @ApiProperty()
  @IsString()
  last_name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  external_id?: string;

  @ApiProperty({ required: false, default: 'en' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  root_admin?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  password?: string;
}

export class CreateServerDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsNumber()
  user: number;

  @ApiProperty()
  @IsNumber()
  egg: number;

  @ApiProperty()
  @IsString()
  docker_image: string;

  @ApiProperty()
  @IsString()
  startup: string;

  @ApiProperty()
  @IsOptional()
  environment?: Record<string, any>;

  @ApiProperty()
  limits: {
    memory: number;
    swap: number;
    disk: number;
    io: number;
    cpu: number;
  };

  @ApiProperty()
  feature_limits: {
    databases: number;
    backups: number;
    allocations: number;
  };

  @ApiProperty()
  allocation: {
    default: number;
    additional?: number[];
  };

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  external_id?: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  start_on_completion?: boolean;
}

export class CreateNodeDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsNumber()
  location_id: number;

  @ApiProperty()
  @IsString()
  fqdn: string;

  @ApiProperty({ required: false, default: 'https' })
  @IsOptional()
  @IsString()
  scheme?: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  behind_proxy?: boolean;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  public?: boolean;

  @ApiProperty()
  @IsNumber()
  memory: number;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsNumber()
  memory_overallocate?: number;

  @ApiProperty()
  @IsNumber()
  disk: number;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsNumber()
  disk_overallocate?: number;

  @ApiProperty({ required: false, default: 8080 })
  @IsOptional()
  @IsNumber()
  daemon_listen?: number;

  @ApiProperty({ required: false, default: 2022 })
  @IsOptional()
  @IsNumber()
  daemon_sftp?: number;

  @ApiProperty({ required: false, default: '/var/lib/pterodactyl/volumes' })
  @IsOptional()
  @IsString()
  daemon_base?: string;

  @ApiProperty({ required: false, default: 100 })
  @IsOptional()
  @IsNumber()
  upload_size?: number;
}

export class CreateLocationDto {
  @ApiProperty()
  @IsString()
  short: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  long?: string;
}

export class CreateAllocationDto {
  @ApiProperty()
  @IsString()
  ip: string;

  @ApiProperty()
  @IsArray()
  ports: number[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  alias?: string;
}