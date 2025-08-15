import { Module } from '@nestjs/common';
import { EggsService } from './eggs.service';
import { EggsController } from './eggs.controller';
import { PterodactylModule } from '../pterodactyl/pterodactyl.module';

@Module({
  imports: [PterodactylModule],
  controllers: [EggsController],
  providers: [EggsService],
  exports: [EggsService],
})
export class EggsModule {}