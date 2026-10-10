import { Module } from '@nestjs/common';
import { ImportarService } from '../importar/importar.service';
import { CatalogoService } from './catalogo.service';
import { PresupuestosController } from './presupuestos.controller';
import { PresupuestosService } from './presupuestos.service';

@Module({
  controllers: [PresupuestosController],
  providers: [PresupuestosService, CatalogoService, ImportarService],
})
export class PresupuestosModule {}
