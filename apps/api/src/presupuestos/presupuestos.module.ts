import { Module } from '@nestjs/common';
import { ImportarService } from '../importar/importar.service';
import { CatalogoService } from './catalogo.service';
import { PresupuestosController, ProyectosController } from './presupuestos.controller';
import { PresupuestosService } from './presupuestos.service';
import { ProyectosService } from './proyectos.service';

@Module({
  controllers: [PresupuestosController, ProyectosController],
  providers: [PresupuestosService, ProyectosService, CatalogoService, ImportarService],
})
export class PresupuestosModule {}
