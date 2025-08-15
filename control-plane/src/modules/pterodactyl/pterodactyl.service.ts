import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosResponse, AxiosRequestConfig } from 'axios';
import { firstValueFrom } from 'rxjs';

import { EncryptionService } from './encryption.service';
import {
  PterodactylUser,
  PterodactylServer,
  PterodactylNode,
  PterodactylLocation,
  PterodactylAllocation,
  PterodactylEgg,
  CreateUserDto,
  CreateServerDto,
  CreateNodeDto,
  CreateLocationDto,
  CreateAllocationDto,
} from './dto/pterodactyl.dto';

@Injectable()
export class PterodactylService {
  private readonly logger = new Logger(PterodactylService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
    private encryptionService: EncryptionService,
  ) {
    this.baseUrl = this.configService.get('PTERODACTYL_URL');
    const encryptedApiKey = this.configService.get('PTERODACTYL_API_KEY');
    
    if (!this.baseUrl || !encryptedApiKey) {
      throw new Error('PTERODACTYL_URL and PTERODACTYL_API_KEY must be configured');
    }

    try {
      // Try to decrypt API key, fallback to plain text for initial setup
      this.apiKey = this.encryptionService.decrypt(encryptedApiKey);
    } catch {
      this.apiKey = encryptedApiKey;
      this.logger.warn('Using plain text API key - consider encrypting it');
    }
  }

  private async makeRequest<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    endpoint: string,
    data?: any,
    retries = 3,
  ): Promise<T> {
    const config: AxiosRequestConfig = {
      method,
      url: `${this.baseUrl}/api/application${endpoint}`,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      data,
    };

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response: AxiosResponse<T> = await firstValueFrom(
          this.httpService.request(config)
        );
        return response.data;
      } catch (error) {
        this.logger.error(`Pterodactyl API request failed (attempt ${attempt}/${retries}):`, {
          endpoint,
          error: error.message,
          status: error.response?.status,
          data: error.response?.data,
        });

        if (attempt === retries) {
          throw new HttpException(
            `Pterodactyl API request failed: ${error.message}`,
            error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }

        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }

  // Users
  async createUser(userData: CreateUserDto): Promise<PterodactylUser> {
    return this.makeRequest<PterodactylUser>('POST', '/users', userData);
  }

  async getUser(id: number): Promise<PterodactylUser> {
    return this.makeRequest<PterodactylUser>('GET', `/users/${id}`);
  }

  async updateUser(id: number, userData: Partial<CreateUserDto>): Promise<PterodactylUser> {
    return this.makeRequest<PterodactylUser>('PATCH', `/users/${id}`, userData);
  }

  async deleteUser(id: number): Promise<void> {
    return this.makeRequest<void>('DELETE', `/users/${id}`);
  }

  // Servers
  async createServer(serverData: CreateServerDto): Promise<PterodactylServer> {
    return this.makeRequest<PterodactylServer>('POST', '/servers', serverData);
  }

  async getServer(id: number): Promise<PterodactylServer> {
    return this.makeRequest<PterodactylServer>('GET', `/servers/${id}`);
  }

  async updateServer(id: number, serverData: Partial<CreateServerDto>): Promise<PterodactylServer> {
    return this.makeRequest<PterodactylServer>('PATCH', `/servers/${id}/details`, serverData);
  }

  async deleteServer(id: number): Promise<void> {
    return this.makeRequest<void>('DELETE', `/servers/${id}`);
  }

  async suspendServer(id: number): Promise<void> {
    return this.makeRequest<void>('POST', `/servers/${id}/suspend`);
  }

  async unsuspendServer(id: number): Promise<void> {
    return this.makeRequest<void>('POST', `/servers/${id}/unsuspend`);
  }

  // Nodes
  async createNode(nodeData: CreateNodeDto): Promise<PterodactylNode> {
    return this.makeRequest<PterodactylNode>('POST', '/nodes', nodeData);
  }

  async getNode(id: number): Promise<PterodactylNode> {
    return this.makeRequest<PterodactylNode>('GET', `/nodes/${id}`);
  }

  async updateNode(id: number, nodeData: Partial<CreateNodeDto>): Promise<PterodactylNode> {
    return this.makeRequest<PterodactylNode>('PATCH', `/nodes/${id}`, nodeData);
  }

  async deleteNode(id: number): Promise<void> {
    return this.makeRequest<void>('DELETE', `/nodes/${id}`);
  }

  async getNodeConfiguration(id: number): Promise<any> {
    return this.makeRequest<any>('GET', `/nodes/${id}/configuration`);
  }

  // Locations
  async createLocation(locationData: CreateLocationDto): Promise<PterodactylLocation> {
    return this.makeRequest<PterodactylLocation>('POST', '/locations', locationData);
  }

  async getLocation(id: number): Promise<PterodactylLocation> {
    return this.makeRequest<PterodactylLocation>('GET', `/locations/${id}`);
  }

  async updateLocation(id: number, locationData: Partial<CreateLocationDto>): Promise<PterodactylLocation> {
    return this.makeRequest<PterodactylLocation>('PATCH', `/locations/${id}`, locationData);
  }

  async deleteLocation(id: number): Promise<void> {
    return this.makeRequest<void>('DELETE', `/locations/${id}`);
  }

  // Allocations
  async createAllocation(nodeId: number, allocationData: CreateAllocationDto): Promise<PterodactylAllocation> {
    return this.makeRequest<PterodactylAllocation>('POST', `/nodes/${nodeId}/allocations`, allocationData);
  }

  async deleteAllocation(nodeId: number, allocationId: number): Promise<void> {
    return this.makeRequest<void>('DELETE', `/nodes/${nodeId}/allocations/${allocationId}`);
  }

  // Eggs
  async getEggs(): Promise<{ data: PterodactylEgg[] }> {
    return this.makeRequest<{ data: PterodactylEgg[] }>('GET', '/eggs');
  }

  async getEgg(id: number): Promise<PterodactylEgg> {
    return this.makeRequest<PterodactylEgg>('GET', `/eggs/${id}`);
  }

  // Utility methods
  async testConnection(): Promise<boolean> {
    try {
      await this.makeRequest<any>('GET', '/users?per_page=1');
      return true;
    } catch (error) {
      this.logger.error('Pterodactyl connection test failed:', error);
      return false;
    }
  }

  encryptApiKey(apiKey: string): string {
    return this.encryptionService.encrypt(apiKey);
  }

  generateDaemonToken(): string {
    // Generate a secure random token for daemon authentication
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 64; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}