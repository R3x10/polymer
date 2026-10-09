import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';
import { servirWeb } from './web-estatica';

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(env));
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  if (env.WEB_DIR) servirWeb(app, env.WEB_DIR);
  await (env.HOST ? app.listen(env.PORT, env.HOST) : app.listen(env.PORT));
}

void bootstrap();
