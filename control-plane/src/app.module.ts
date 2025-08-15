import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule } from '@nestjs/throttler';

import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { NodesModule } from './modules/nodes/nodes.module';
import { ServersModule } from './modules/servers/servers.module';
import { UsersModule } from './modules/users/users.module';
import { PterodactylModule } from './modules/pterodactyl/pterodactyl.module';
import { AuditModule } from './modules/audit/audit.module';
import { AgentModule } from './modules/agent/agent.module';
import { WebsocketModule } from './modules/websocket/websocket.module';
import { EggsModule } from './modules/eggs/eggs.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Database
    PrismaModule,

    // Queue system
    BullModule.forRootAsync({
      useFactory: () => ({
        redis: {
          host: process.env.REDIS_URL?.split('://')[1]?.split(':')[0] || 'localhost',
          port: parseInt(process.env.REDIS_URL?.split(':')[2] || '6379'),
        },
      }),
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),

    // Application modules
    AuthModule,
    TenantsModule,
    NodesModule,
    ServersModule,
    UsersModule,
    PterodactylModule,
    AuditModule,
    AgentModule,
    WebsocketModule,
    EggsModule,
  ],
})
export class AppModule {}