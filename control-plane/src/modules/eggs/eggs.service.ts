import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PterodactylService } from '../pterodactyl/pterodactyl.service';

@Injectable()
export class EggsService {
  constructor(
    private prisma: PrismaService,
    private pterodactylService: PterodactylService,
  ) {}

  async syncFromPterodactyl() {
    const pterodactylEggs = await this.pterodactylService.getEggs();
    
    for (const eggData of pterodactylEggs.data) {
      await this.prisma.egg.upsert({
        where: { id: eggData.id },
        update: {
          name: eggData.name,
          description: eggData.description,
          dockerImage: eggData.docker_image,
          startup: eggData.startup,
          configFiles: eggData.config.files,
          configLogs: eggData.config.logs,
          configStop: eggData.config.stop,
          variables: eggData.environment,
        },
        create: {
          id: eggData.id,
          name: eggData.name,
          description: eggData.description,
          dockerImage: eggData.docker_image,
          startup: eggData.startup,
          category: 'general',
          configFiles: eggData.config.files,
          configLogs: eggData.config.logs,
          configStop: eggData.config.stop,
          variables: eggData.environment,
        },
      });
    }

    return { message: 'Eggs synced successfully' };
  }

  async findAll(tenantId?: string) {
    if (tenantId) {
      return this.prisma.egg.findMany({
        where: {
          tenantEggs: {
            some: { tenantId, enabled: true },
          },
        },
      });
    }
    return this.prisma.egg.findMany({ where: { active: true } });
  }
}