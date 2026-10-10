import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DB, Db } from '../db/db.module';
import { porLotes } from '../db/lotes';
import { insumos, matrices, matrizRenglones, presupuestoRenglones, presupuestos } from '../db/schema';
import { ProyectosService } from '../presupuestos/proyectos.service';
import { interpretarNeodata, PresupuestoImportado } from './neodata';
import { ErrorDeArchivo } from './xlsx';

@Injectable()
export class ImportarService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly proyectos: ProyectosService,
  ) {}

  /** Importa a un proyecto existente (`proyectoId`) o a uno nuevo nombrado como la obra del archivo. */
  async neodata(contenido: Uint8Array, usuarioId: string, opciones: { nombre?: string; proyectoId?: string } = {}) {
    let datos: PresupuestoImportado;
    try {
      datos = interpretarNeodata(contenido);
    } catch (e) {
      if (e instanceof ErrorDeArchivo) throw new BadRequestException(e.message);
      throw e;
    }
    const id = await this.guardar({ ...datos, nombre: opciones.nombre?.trim() || datos.nombre }, 'Neodata', usuarioId, opciones.proyectoId);
    return { id, advertencias: datos.advertencias, totalOrigen: datos.totalOrigen };
  }

  /** Guarda un presupuesto importado en una sola transacción. */
  private async guardar(datos: PresupuestoImportado, origen: string, usuarioId: string, proyectoId?: string): Promise<string> {
    return this.db.transaction(async (tx) => {
      const proyecto = proyectoId
        ? await this.proyectos.obtener(proyectoId, tx)
        : await this.proyectos.buscarOCrear({ nombre: datos.nombre, cliente: datos.cliente, ubicacion: datos.ubicacion }, tx);
      const [p] = await tx.insert(presupuestos).values({ proyectoId: proyecto.id, nombre: datos.nombre, origen, creadoPor: usuarioId }).returning();

      await porLotes(datos.insumos, (lote) => tx.insert(insumos).values(lote.map((i) => ({ ...i, presupuestoId: p.id }))));

      const idMatriz = new Map(datos.matrices.map((m) => [m.clave, randomUUID()]));
      const matrizPorClave = new Map(datos.matrices.map((m) => [m.clave, m]));
      await porLotes(datos.matrices, (lote) =>
        tx.insert(matrices).values(lote.map(({ renglones: _, ...m }) => ({ ...m, id: idMatriz.get(m.clave)!, presupuestoId: p.id }))),
      );
      const renglonesMatriz = datos.matrices.flatMap((m) =>
        m.renglones.map((r, i) => ({ matrizId: idMatriz.get(m.clave)!, orden: (i + 1) * 10, componente: r.componente, cantidad: r.cantidad })),
      );
      await porLotes(renglonesMatriz, (lote) => tx.insert(matrizRenglones).values(lote));

      // Árbol: ids generados aquí para ligar padres; se insertan por nivel para que el padre exista antes.
      const idRenglon = new Map(datos.renglones.map((r) => [r.ref, randomUUID()]));
      const porRef = new Map(datos.renglones.map((r) => [r.ref, r]));
      const nivel = (ref: string | undefined): number => (ref ? 1 + nivel(porRef.get(ref)?.padreRef) : 0);
      const contador = new Map<string | undefined, number>();
      const filas = datos.renglones.map((r) => {
        const orden = (contador.get(r.padreRef) ?? 0) + 10;
        contador.set(r.padreRef, orden);
        return {
          nivel: nivel(r.ref),
          fila: {
            id: idRenglon.get(r.ref)!,
            presupuestoId: p.id,
            padreId: r.padreRef ? idRenglon.get(r.padreRef)! : null,
            orden,
            tipo: r.tipo,
            // El concepto toma clave, descripción y unidad de su matriz, salvo que el archivo traiga las suyas.
            clave: r.clave || (r.matriz ?? ''),
            descripcion: r.descripcion || (r.matriz ? matrizPorClave.get(r.matriz)!.descripcion : ''),
            unidad: r.matriz ? matrizPorClave.get(r.matriz)!.unidad : '',
            matrizId: r.matriz ? idMatriz.get(r.matriz)! : null,
            cantidad: r.cantidad ?? null,
          },
        };
      });
      filas.sort((a, b) => a.nivel - b.nivel);
      await porLotes(filas, (lote) => tx.insert(presupuestoRenglones).values(lote.map((f) => f.fila)));
      return p.id;
    });
  }
}
