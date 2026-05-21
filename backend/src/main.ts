import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = NestFactory.create(AppModule);
  const nestApp = await app;

  nestApp.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  const origins = process.env['CORS_ORIGINS']?.split(',') ?? ['http://localhost:4200'];
  nestApp.enableCors({ origin: origins });

  const port = process.env['BACKEND_PORT'] ?? 3000;
  await nestApp.listen(port);
  console.log(`Backend running on http://localhost:${port}`);
}
bootstrap();
