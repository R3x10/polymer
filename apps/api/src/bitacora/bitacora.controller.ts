import { Controller, DefaultValuePipe, Get, Inject, ParseIntPipe, Query } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { Roles } from '../auth/decorators';
import { DB, Db } from '../db/db.module';
import { bitacora, usuarios } from '../db/schema';

@Controller('bitacora')
@Roles('admin')
export class BitacoraController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  listar(@Query('limite', new DefaultValuePipe(200), ParseIntPipe) limite: number) {
    return this.db
      .select({
        id: bitacora.id,
        fecha: bitacora.fecha,
        usuario: usuarios.nombre,
        metodo: bitacora.metodo,
        ruta: bitacora.ruta,
        estado: bitacora.estado,
        datos: bitacora.datos,
      })
      .from(bitacora)
      .leftJoin(usuarios, eq(usuarios.id, bitacora.usuarioId))
      .orderBy(desc(bitacora.fecha))
      .limit(Math.min(Math.max(limite, 1), 2000));
  }
}
