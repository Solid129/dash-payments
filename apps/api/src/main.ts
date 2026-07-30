import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // The PSP webhook must verify an HMAC over the exact bytes received. Any
    // re-serialisation of the parsed body (key order, whitespace) would change
    // the digest, so we keep the original buffer.
    rawBody: true,
  });

  const config = app.get(ConfigService);
  const isProduction = config.get<string>('NODE_ENV') === 'production';
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.use(
    helmet({
      // The API serves JSON, not HTML; CSP here would only restrict a page we
      // never render. The frontend is served separately by Vite/a CDN.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // Credentialed CORS requires an explicit origin — `*` is rejected by browsers
  // when `credentials: true`, and allowing any origin to send cookies would
  // defeat the point of SameSite.
  app.enableCors({
    origin: config
      .getOrThrow<string>('WEB_ORIGIN')
      .split(',')
      .map((o) => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      // Strip unknown properties, then reject if any were present. Combined,
      // these mean a client cannot smuggle an unexpected field (say `merchantId`
      // or `status`) into a DTO and have it silently reach the database.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // `trust proxy` so rate limiting and audit logs see the real client IP rather
  // than the load balancer's, when deployed behind one.
  if (isProduction) {
    app.set('trust proxy', 1);
  }

  app.enableShutdownHooks();

  if (!isProduction) {
    const swagger = new DocumentBuilder()
      .setTitle('Merchant Payments API')
      .setDescription(
        'Dashboard, transactions, and asynchronous payouts. ' +
          'Browser clients authenticate with httpOnly cookies; a Bearer token is accepted here for convenience.',
      )
      .setVersion('1.0')
      .addCookieAuth('access_token')
      .addBearerAuth()
      .build();

    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger), {
      swaggerOptions: { withCredentials: true, persistAuthorization: true },
    });
  }

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);

  logger.log(`API listening on http://localhost:${port}/api`);
  if (!isProduction) {
    logger.log(`Swagger UI at http://localhost:${port}/api/docs`);
  }
}

void bootstrap();
