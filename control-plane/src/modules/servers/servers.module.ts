import { Module } from '@nestjs/common';
import { ServersService } from './servers.service';
import { ServersController } from './servers.controller';
import { AuthModule } from '../auth/auth.module';
import { PterodactylModule } from '../pterodactyl/pterodactyl.module';

@Module({
  imports: [AuthModule, PterodactylModule],
  controllers: [ServersController],
  providers: [ServersService],
  exports: [ServersService],
})
export class ServersModule {}