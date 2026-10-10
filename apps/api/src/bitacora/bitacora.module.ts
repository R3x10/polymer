import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { BitacoraController } from './bitacora.controller';
import { BitacoraInterceptor } from './bitacora.interceptor';

@Module({
  controllers: [BitacoraController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: BitacoraInterceptor }],
})
export class BitacoraModule {}
