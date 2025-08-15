import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async authenticateAgent(token: string) {
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('AGENT_TOKEN_SECRET'),
      });

      const node = await this.prisma.node.findUnique({
        where: { id: payload.nodeId },
        include: { tenant: true },
      });

      if (!node) {
        throw new UnauthorizedException('Node not found');
      }

      return node;
    } catch (error) {
      this.logger.error('Agent authentication failed:', error);
      throw new UnauthorizedException('Invalid agent token');
    }
  }

  async generateAgentToken(nodeId: string) {
    const payload = { nodeId, type: 'agent' };
    return this.jwtService.sign(payload, {
      secret: this.configService.get('AGENT_TOKEN_SECRET'),
      expiresIn: '30d',
    });
  }

  async handleHeartbeat(nodeId: string, metrics: any) {
    await this.prisma.node.update({
      where: { id: nodeId },
      data: {
        lastHeartbeat: new Date(),
        status: 'online',
        agentVersion: metrics.agentVersion,
        wingsVersion: metrics.wingsVersion,
      },
    });

    // Store metrics
    if (metrics.system) {
      await this.prisma.nodeMetric.create({
        data: {
          nodeId,
          cpuUsage: metrics.system.cpuUsage,
          memoryUsage: metrics.system.memoryUsage,
          diskUsage: metrics.system.diskUsage,
          networkRx: BigInt(metrics.system.networkRx || 0),
          networkTx: BigInt(metrics.system.networkTx || 0),
        },
      });
    }

    return { status: 'ok' };
  }
}