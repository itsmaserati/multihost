import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { nanoid } from 'nanoid';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PterodactylService } from '../pterodactyl/pterodactyl.service';

@Injectable()
export class NodesService {
  private readonly logger = new Logger(NodesService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private pterodactylService: PterodactylService,
    @InjectQueue('node-operations') private nodeQueue: Queue,
  ) {}

  async generateEnrollmentToken(tenantId: string, tenantAdminId: string) {
    const token = nanoid(64);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours

    const node = await this.prisma.node.create({
      data: {
        tenantId,
        name: 'Pending Node',
        fqdn: 'pending',
        publicIp: '0.0.0.0',
        cpuCores: 0,
        memoryMb: 0,
        diskGb: 0,
        status: 'pending',
        enrollmentToken: token,
        enrollmentExpiresAt: expiresAt,
      },
    });

    await this.auditService.log({
      tenantId,
      tenantAdminId,
      nodeId: node.id,
      action: 'generate_enrollment',
      resource: 'node',
      resourceId: node.id,
    });

    return {
      nodeId: node.id,
      enrollmentToken: token,
      expiresAt,
      installCommand: this.generateInstallCommand(token),
    };
  }

  private generateInstallCommand(token: string): string {
    const controlPlaneUrl = process.env.CONTROL_PLANE_URL || 'https://cp.example.com';
    return `curl -fsSL ${controlPlaneUrl}/api/nodes/install | bash -s -- ${token}`;
  }

  async enrollNode(token: string, nodeData: any) {
    const node = await this.prisma.node.findUnique({
      where: { enrollmentToken: token },
      include: { tenant: true },
    });

    if (!node || node.enrollmentExpiresAt < new Date()) {
      throw new NotFoundException('Invalid or expired enrollment token');
    }

    // Create location in Pterodactyl
    const location = await this.pterodactylService.createLocation({
      short: `loc-${node.tenantId.slice(0, 8)}`,
      long: `Location for ${node.tenant.name}`,
    });

    // Create node in Pterodactyl
    const pterodactylNode = await this.pterodactylService.createNode({
      name: nodeData.name,
      description: `Node for tenant ${node.tenant.name}`,
      location_id: location.id,
      fqdn: nodeData.fqdn,
      memory: nodeData.memoryMb,
      disk: nodeData.diskGb,
      public: false,
    });

    // Update our node record
    const updatedNode = await this.prisma.node.update({
      where: { id: node.id },
      data: {
        name: nodeData.name,
        fqdn: nodeData.fqdn,
        publicIp: nodeData.publicIp,
        privateIp: nodeData.privateIp,
        cpuCores: nodeData.cpuCores,
        memoryMb: nodeData.memoryMb,
        diskGb: nodeData.diskGb,
        pterodactylId: pterodactylNode.id,
        locationId: location.id,
        daemonToken: this.pterodactylService.encryptApiKey(pterodactylNode.daemon_token),
        status: 'installing',
        enrollmentToken: null,
        enrollmentExpiresAt: null,
      },
    });

    // Create default allocations
    const ports = Array.from({ length: 100 }, (_, i) => 25565 + i);
    await this.pterodactylService.createAllocation(pterodactylNode.id, {
      ip: nodeData.privateIp || nodeData.publicIp,
      ports,
    });

    return {
      nodeId: updatedNode.id,
      daemonConfig: await this.pterodactylService.getNodeConfiguration(pterodactylNode.id),
    };
  }

  // Additional node management methods would go here
  async findAll(tenantId?: string) {
    const where = tenantId ? { tenantId } : {};
    return this.prisma.node.findMany({
      where,
      include: {
        tenant: {
          select: { id: true, name: true, domain: true },
        },
        _count: {
          select: { servers: true },
        },
      },
    });
  }

  async findOne(id: string) {
    const node = await this.prisma.node.findUnique({
      where: { id },
      include: {
        tenant: true,
        servers: true,
        metrics: {
          orderBy: { timestamp: 'desc' },
          take: 100,
        },
      },
    });

    if (!node) {
      throw new NotFoundException('Node not found');
    }

    return node;
  }

  async updateHeartbeat(nodeId: string, metrics: any) {
    await this.prisma.node.update({
      where: { id: nodeId },
      data: {
        lastHeartbeat: new Date(),
        status: 'online',
      },
    });

    // Store metrics
    await this.prisma.nodeMetric.create({
      data: {
        nodeId,
        cpuUsage: metrics.cpuUsage,
        memoryUsage: metrics.memoryUsage,
        diskUsage: metrics.diskUsage,
        networkRx: BigInt(metrics.networkRx),
        networkTx: BigInt(metrics.networkTx),
      },
    });
  }
}