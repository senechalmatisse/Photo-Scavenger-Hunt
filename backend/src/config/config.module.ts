import { DynamicModule, Global, Module } from '@nestjs/common';
import { APP_CONFIG } from '../shared/infrastructure/tokens';
import { AppConfig } from './app-config';

/** Expose la configuration déjà validée (chargée une seule fois au démarrage). */
@Global()
@Module({})
export class ConfigModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}
