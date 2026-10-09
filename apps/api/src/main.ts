import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule.forRoot(env));
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  await app.listen(env.PORT);
}

void bootstrap();
