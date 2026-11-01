import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { loadConfig } from './config/app-config';

async function bootstrap(): Promise<void> {
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }
  const config = loadConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config), {
    logger: ['log', 'warn', 'error'],
  });
  if (config.http.trustProxy) {
    app.set('trust proxy', 1);
  }
  configureApp(app, config);
  await app.listen(config.http.port);
}

void bootstrap();
