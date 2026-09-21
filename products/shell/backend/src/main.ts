import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.enableCors({
    origin: process.env['CORS_ORIGINS']?.split(',') ?? ['http://localhost:4200'],
  });
  const port = Number(process.env['SHELL_BACKEND_PORT'] ?? 3000);
  await app.listen(port);
  Logger.log(`Shell dashboard backend running on http://localhost:${port}`);
}

void bootstrap();
