import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PterodactylService } from '../pterodactyl/pterodactyl.service';

@Injectable()
export class ServersService {
  constructor(
    private prisma: PrismaService,
    private pterodactylService: PterodactylService,
  ) {}

  async create(createServerDto: any, tenantId: string) {
    // Implementation for creating servers
    return { message: 'Server creation not yet implemented' };
  }

  async findAll(tenantId?: string) {
    const where = tenantId ? { tenantId } : {};
    return this.prisma.server.findMany({ where });
  }

  async findOne(id: string) {
    const server = await this.prisma.server.findUnique({ where: { id } });
    if (!server) {
      throw new NotFoundException('Server not found');
    }
    return server;
  }
}