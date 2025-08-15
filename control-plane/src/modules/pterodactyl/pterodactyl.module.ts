import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

import { PterodactylService } from './pterodactyl.service';
import { EncryptionService } from './encryption.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    ConfigModule,
  ],
  providers: [PterodactylService, EncryptionService],
  exports: [PterodactylService, EncryptionService],
})
export class PterodactylModule {}