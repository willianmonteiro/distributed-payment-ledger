import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();
  // Open CORS: this is a local demo/portfolio service, not multi-tenant production.
  app.enableCors();
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
