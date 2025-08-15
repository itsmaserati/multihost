import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import * as argon2 from 'argon2';
import { nanoid } from 'nanoid';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateTenantDto, UpdateTenantDto, InviteTenantAdminDto } from './dto/tenants.dto';

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    @InjectQueue('tenant-operations') private tenantQueue: Queue,
  ) {}

  async create(createTenantDto: CreateTenantDto, globalAdminId: string) {
    // Check if domain already exists
    const existingTenant = await this.prisma.tenant.findUnique({
      where: { domain: createTenantDto.domain },
    });

    if (existingTenant) {
      throw new ConflictException('A tenant with this domain already exists');
    }

    const tenant = await this.prisma.tenant.create({
      data: {
        name: createTenantDto.name,
        domain: createTenantDto.domain,
        description: createTenantDto.description,
        maxNodes: createTenantDto.maxNodes || 5,
        maxServers: createTenantDto.maxServers || 10,
        maxUsers: createTenantDto.maxUsers || 50,
        storageGb: createTenantDto.storageGb || 100,
        memoryMb: createTenantDto.memoryMb || 4096,
        cpuCores: createTenantDto.cpuCores || 2,
      },
    });

    await this.auditService.log({
      globalAdminId,
      action: 'create',
      resource: 'tenant',
      resourceId: tenant.id,
      details: { name: tenant.name, domain: tenant.domain },
    });

    this.logger.log(`Created tenant: ${tenant.name} (${tenant.id})`);
    return tenant;
  }

  async findAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    
    const [tenants, total] = await Promise.all([
      this.prisma.tenant.findMany({
        skip,
        take: limit,
        include: {
          _count: {
            select: {
              admins: true,
              nodes: true,
              servers: true,
              users: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.tenant.count(),
    ]);

    return {
      data: tenants,
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        admins: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            active: true,
            lastLoginAt: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            nodes: true,
            servers: true,
            users: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return tenant;
  }

  async update(id: string, updateTenantDto: UpdateTenantDto, globalAdminId: string) {
    const existingTenant = await this.findOne(id);

    // Check domain uniqueness if changing
    if (updateTenantDto.domain && updateTenantDto.domain !== existingTenant.domain) {
      const domainExists = await this.prisma.tenant.findUnique({
        where: { domain: updateTenantDto.domain },
      });

      if (domainExists) {
        throw new ConflictException('A tenant with this domain already exists');
      }
    }

    const updatedTenant = await this.prisma.tenant.update({
      where: { id },
      data: updateTenantDto,
    });

    await this.auditService.log({
      globalAdminId,
      tenantId: id,
      action: 'update',
      resource: 'tenant',
      resourceId: id,
      details: updateTenantDto,
    });

    this.logger.log(`Updated tenant: ${updatedTenant.name} (${id})`);
    return updatedTenant;
  }

  async remove(id: string, globalAdminId: string) {
    const tenant = await this.findOne(id);

    // Check if tenant has active resources
    const counts = await this.prisma.tenant.findUnique({
      where: { id },
      select: {
        _count: {
          select: {
            nodes: true,
            servers: true,
            users: true,
          },
        },
      },
    });

    if (counts._count.nodes > 0 || counts._count.servers > 0) {
      throw new ConflictException('Cannot delete tenant with active nodes or servers');
    }

    await this.prisma.tenant.delete({ where: { id } });

    await this.auditService.log({
      globalAdminId,
      action: 'delete',
      resource: 'tenant',
      resourceId: id,
      details: { name: tenant.name, domain: tenant.domain },
    });

    this.logger.log(`Deleted tenant: ${tenant.name} (${id})`);
    return { message: 'Tenant deleted successfully' };
  }

  async inviteAdmin(tenantId: string, inviteDto: InviteTenantAdminDto, globalAdminId: string) {
    const tenant = await this.findOne(tenantId);

    // Check if email already exists
    const existingAdmin = await this.prisma.tenantAdmin.findUnique({
      where: { email: inviteDto.email },
    });

    if (existingAdmin) {
      throw new ConflictException('An admin with this email already exists');
    }

    // Generate invite token
    const inviteToken = nanoid(32);
    const inviteExpiresAt = new Date();
    inviteExpiresAt.setDate(inviteExpiresAt.getDate() + 7); // 7 days

    // Create temporary password
    const tempPassword = nanoid(12);
    const hashedPassword = await argon2.hash(tempPassword);

    const tenantAdmin = await this.prisma.tenantAdmin.create({
      data: {
        tenantId,
        email: inviteDto.email,
        name: inviteDto.name,
        role: inviteDto.role || 'admin',
        password: hashedPassword,
        inviteToken,
        inviteExpiresAt,
        active: false,
      },
    });

    // Queue email sending (if email service is configured)
    await this.tenantQueue.add('send-invite-email', {
      tenantAdminId: tenantAdmin.id,
      tenantName: tenant.name,
      inviteToken,
      tempPassword,
    });

    await this.auditService.log({
      globalAdminId,
      tenantId,
      action: 'invite',
      resource: 'tenant_admin',
      resourceId: tenantAdmin.id,
      details: { email: inviteDto.email, role: inviteDto.role },
    });

    this.logger.log(`Invited tenant admin: ${inviteDto.email} for tenant ${tenantId}`);

    return {
      id: tenantAdmin.id,
      email: tenantAdmin.email,
      name: tenantAdmin.name,
      role: tenantAdmin.role,
      inviteToken,
      tempPassword, // In production, this should be sent via email only
      inviteExpiresAt,
    };
  }

  async acceptInvite(inviteToken: string, newPassword: string) {
    const tenantAdmin = await this.prisma.tenantAdmin.findUnique({
      where: { inviteToken },
      include: { tenant: true },
    });

    if (!tenantAdmin) {
      throw new NotFoundException('Invalid invite token');
    }

    if (tenantAdmin.inviteExpiresAt < new Date()) {
      throw new ConflictException('Invite token has expired');
    }

    const hashedPassword = await argon2.hash(newPassword);

    const updatedAdmin = await this.prisma.tenantAdmin.update({
      where: { id: tenantAdmin.id },
      data: {
        password: hashedPassword,
        active: true,
        inviteToken: null,
        inviteExpiresAt: null,
      },
    });

    await this.auditService.log({
      tenantId: tenantAdmin.tenantId,
      tenantAdminId: updatedAdmin.id,
      action: 'accept_invite',
      resource: 'tenant_admin',
      resourceId: updatedAdmin.id,
    });

    this.logger.log(`Tenant admin accepted invite: ${updatedAdmin.email}`);

    return {
      message: 'Invite accepted successfully',
      tenant: {
        id: tenantAdmin.tenant.id,
        name: tenantAdmin.tenant.name,
        domain: tenantAdmin.tenant.domain,
      },
    };
  }

  async getUsageStats(tenantId: string) {
    const tenant = await this.findOne(tenantId);

    const stats = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        maxNodes: true,
        maxServers: true,
        maxUsers: true,
        storageGb: true,
        memoryMb: true,
        cpuCores: true,
        _count: {
          select: {
            nodes: { where: { status: { not: 'error' } } },
            servers: { where: { status: { not: 'error' } } },
            users: { where: { active: true } },
          },
        },
      },
    });

    // Calculate resource usage
    const [memoryUsage, storageUsage] = await Promise.all([
      this.prisma.server.aggregate({
        where: { tenantId, status: { not: 'error' } },
        _sum: { memoryMb: true },
      }),
      this.prisma.server.aggregate({
        where: { tenantId, status: { not: 'error' } },
        _sum: { diskMb: true },
      }),
    ]);

    return {
      limits: {
        nodes: stats.maxNodes,
        servers: stats.maxServers,
        users: stats.maxUsers,
        storageGb: stats.storageGb,
        memoryMb: stats.memoryMb,
        cpuCores: stats.cpuCores,
      },
      usage: {
        nodes: stats._count.nodes,
        servers: stats._count.servers,
        users: stats._count.users,
        storageGb: Math.round((storageUsage._sum.diskMb || 0) / 1024),
        memoryMb: memoryUsage._sum.memoryMb || 0,
      },
      percentages: {
        nodes: Math.round((stats._count.nodes / stats.maxNodes) * 100),
        servers: Math.round((stats._count.servers / stats.maxServers) * 100),
        users: Math.round((stats._count.users / stats.maxUsers) * 100),
        storage: Math.round(((storageUsage._sum.diskMb || 0) / 1024 / stats.storageGb) * 100),
        memory: Math.round(((memoryUsage._sum.memoryMb || 0) / stats.memoryMb) * 100),
      },
    };
  }
}