import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const isProd = process.env.NODE_ENV === 'production';

  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? (isProd ? '0.0.0.0' : '127.0.0.1');
  const apiPrefix = process.env.API_PREFIX ?? 'api';

  const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
    : true;

  const app = await NestFactory.create(AppModule);

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
