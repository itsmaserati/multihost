import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId?: string) {
    const where = tenantId ? { tenantId } : {};
    return this.prisma.user.findMany({ where });
  }
}