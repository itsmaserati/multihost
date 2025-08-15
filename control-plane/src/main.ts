import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: true,
      trustProxy: true,
    }),
  );

  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Global prefix
  const apiPrefix = configService.get('API_PREFIX', 'api');
  app.setGlobalPrefix(apiPrefix);

  // Security middleware
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  });

  // CORS
  await app.register(cors, {
    origin: configService.get('CORS_ORIGIN', 'http://localhost:3001').split(','),
    credentials: true,
  });

  // Rate limiting
  await app.register(rateLimit, {
    timeWindow: configService.get('RATE_LIMIT_TTL', 60000),
    max: configService.get('RATE_LIMIT_LIMIT', 100),
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger documentation
  if (configService.get('ENABLE_SWAGGER', true)) {
    const config = new DocumentBuilder()
      .setTitle('Pterodactyl Control Plane API')
      .setDescription('Multi-tenant hosting control plane built on Pterodactyl')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document);
  }

  // Health check endpoint
  app.getHttpAdapter().get('/health', (req, reply) => {
    reply.send({ status: 'ok', timestamp: new Date().toISOString() });
  });

  const port = configService.get('PORT', 3000);
  await app.listen(port, '0.0.0.0');

  logger.log(`🚀 Control Plane API running on port ${port}`);
  logger.log(`📚 API documentation available at http://localhost:${port}/${apiPrefix}/docs`);
}

bootstrap().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});