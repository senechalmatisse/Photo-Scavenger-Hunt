import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppConfig } from './config/app-config';
import { AppLogger } from './shared/application/ports';
import { requestLogging } from './shared/infrastructure/http/request-logging.middleware';
import { APP_LOGGER } from './shared/infrastructure/tokens';

/** Configuration HTTP commune au démarrage réel et aux tests de bout en bout. */
export function configureApp(app: INestApplication, config: AppConfig): void {
  app.setGlobalPrefix('api');
  app.use(requestLogging(app.get<AppLogger>(APP_LOGGER)));
  app.use(helmet());
  app.enableCors({ origin: [...config.http.corsOrigins], methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.enableShutdownHooks();

  const openApi = new DocumentBuilder()
    .setTitle('Photo Scavenger Hunt API')
    .setDescription('Défis photographiques à partir des photos publiques de Flickr.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, openApi));
}
