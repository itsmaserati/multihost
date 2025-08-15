import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'info' },
        { emit: 'event', level: 'warn' },
      ],
    });
  }

  async onModuleInit() {
    // Log queries in development
    if (process.env.NODE_ENV === 'development') {
      this.$on('query', (e) => {
        this.logger.debug(`Query: ${e.query} - Params: ${e.params} - Duration: ${e.duration}ms`);
      });
    }

    this.$on('error', (e) => {
      this.logger.error('Database error:', e);
    });

    this.$on('warn', (e) => {
      this.logger.warn('Database warning:', e);
    });

    this.$on('info', (e) => {
      this.logger.log('Database info:', e);
    });

    await this.$connect();
    this.logger.log('Connected to database');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Disconnected from database');
  }

  // Helper method for tenant-scoped queries
  forTenant(tenantId: string) {
    return this.$extends({
      query: {
        $allModels: {
          async findMany({ args, query }) {
            args.where = { ...args.where, tenantId };
            return query(args);
          },
          async findFirst({ args, query }) {
            args.where = { ...args.where, tenantId };
            return query(args);
          },
          async findUnique({ args, query }) {
            args.where = { ...args.where, tenantId };
            return query(args);
          },
          async update({ args, query }) {
            args.where = { ...args.where, tenantId };
            return query(args);
          },
          async updateMany({ args, query }) {
            args.where = { ...args.where, tenantId };
            return query(args);
          },
          async delete({ args, query }) {
            args.where = { ...args.where, tenantId };
            return query(args);
          },
          async deleteMany({ args, query }) {
            args.where = { ...args.where, tenantId };
            return query(args);
          },
        },
      },
    });
  }
}