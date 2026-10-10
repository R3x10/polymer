import { DynamicModule, Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { BitacoraModule } from './bitacora/bitacora.module';
import { ConfigModule } from './config/config.module';
import { Env } from './config/env';
import { DbModule } from './db/db.module';
import { HealthController } from './health/health.controller';
import { PresupuestosModule } from './presupuestos/presupuestos.module';
import { UsersModule } from './users/users.module';

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [ConfigModule.forRoot(env), DbModule, UsersModule, AuthModule, PresupuestosModule, BitacoraModule],
      controllers: [HealthController],
    };
  }
}
