import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';

import { NodesController } from './nodes.controller';
import { NodesService } from './nodes.service';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { PterodactylModule } from '../pterodactyl/pterodactyl.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'node-operations',
    }),
    AuthModule,
    AuditModule,
    PterodactylModule,
  ],
  controllers: [NodesController],
  providers: [NodesService],
  exports: [NodesService],
})
export class NodesModule {}