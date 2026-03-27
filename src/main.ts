import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import * as winston from 'winston';

import { existsSync, mkdirSync } from 'fs';
import { WinstonModule } from 'nest-winston';

async function bootstrap() {
  const isProd = process.env.NODE_ENV === 'production';

  // Ensure logs directory exists for file transport
  const logsDir = join(process.cwd(), 'logs');
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }

  // Configure Winston logger with sensible defaults per environment
  const consoleFormat = isProd
    ? winston.format.combine(winston.format.timestamp(), winston.format.json())
    : winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const rest = Object.keys(meta).length
            ? ` ${JSON.stringify(meta)}`
            : '';
          return `[${timestamp}] ${level}: ${message}${rest}`;
        }),
      );

  //
  const logger = WinstonModule.createLogger({
    level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
    exitOnError: false,
    transports: [
      new winston.transports.Console({
        level: process.env.CONSOLE_LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
        format: consoleFormat,
        handleExceptions: true,
      }),
      new winston.transports.File({
        filename: join(logsDir, 'app.log'),
        level: process.env.FILE_LOG_LEVEL ?? 'info',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json(),
        ),
        handleExceptions: true,
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5,
      }),
    ],
  });

  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? (isProd ? '0.0.0.0' : '127.0.0.1');
  const apiPrefix = process.env.API_PREFIX ?? 'api';

  const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
    : true;

  const app = await NestFactory.create(AppModule, { logger });

  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('NestJS Wallet & Transaction API')
    .setDescription(
      'API documentation for a Secure Wallet & Transaction Processing API.',
    )
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document); // Setup Swagger at /api-docs

  // Global API prefix
  app.setGlobalPrefix(apiPrefix);

  // versioning now using v1
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // CORS configuration
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders:
      'Origin, X-Requested-With, Content-Type, Accept, Authorization',
    exposedHeaders: 'Content-Length, Content-Type',
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: !isProd,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      stopAtFirstError: true,
      validationError: {
        target: false,
        value: false,
      },
    }),
  );

  // Graceful shutdown
  app.enableShutdownHooks();

  await app.listen(port, host);
}
bootstrap();
