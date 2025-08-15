import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface AuditLogData {
  tenantId?: string;
  globalAdminId?: string;
  tenantAdminId?: string;
  nodeId?: string;
  serverId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  async log(data: AuditLogData) {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: data.tenantId,
          globalAdminId: data.globalAdminId,
          tenantAdminId: data.tenantAdminId,
          nodeId: data.nodeId,
          serverId: data.serverId,
          action: data.action,
          resource: data.resource,
          resourceId: data.resourceId,
          details: data.details,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
        },
      });

      this.logger.debug(`Audit log created: ${data.action} ${data.resource}`, data);
    } catch (error) {
      this.logger.error('Failed to create audit log:', error);
      // Don't throw error to avoid breaking the main operation
    }
  }

  async getLogs(filters: {
    tenantId?: string;
    globalAdminId?: string;
    tenantAdminId?: string;
    resource?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }) {
    const {
      tenantId,
      globalAdminId,
      tenantAdminId,
      resource,
      action,
      startDate,
      endDate,
      page = 1,
      limit = 50,
    } = filters;

    const skip = (page - 1) * limit;

    const where: any = {};
    
    if (tenantId) where.tenantId = tenantId;
    if (globalAdminId) where.globalAdminId = globalAdminId;
    if (tenantAdminId) where.tenantAdminId = tenantAdminId;
    if (resource) where.resource = resource;
    if (action) where.action = action;
    
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          globalAdmin: {
            select: { id: true, email: true, name: true },
          },
          tenantAdmin: {
            select: { id: true, email: true, name: true },
          },
          tenant: {
            select: { id: true, name: true, domain: true },
          },
          node: {
            select: { id: true, name: true, fqdn: true },
          },
          server: {
            select: { id: true, name: true },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getLogsByTenant(tenantId: string, page = 1, limit = 50) {
    return this.getLogs({ tenantId, page, limit });
  }

  async getSystemLogs(page = 1, limit = 50) {
    return this.getLogs({ page, limit });
  }
}