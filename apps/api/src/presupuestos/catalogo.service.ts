import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq, inArray } from 'drizzle-orm';
import { Catalogo, ErrorDeCatalogo, MotorApu } from '@puselfhost/motor-pu';
import { DB, Db } from '../db/db.module';
import { insumos, matrices, matrizRenglones, presupuestos } from '../db/schema';

export type FilaInsumo = typeof insumos.$inferSelect;
export type FilaMatriz = typeof matrices.$inferSelect;
export type FilaRenglonMatriz = typeof matrizRenglones.$inferSelect;

export interface CatalogoCargado {
  presupuesto: typeof presupuestos.$inferSelect;
  insumos: FilaInsumo[];
  matrices: FilaMatriz[];
  renglones: Map<string, FilaRenglonMatriz[]>;
  motor: MotorApu;
}

/** Convierte las filas de la base al catálogo que entiende el motor de cálculo. */
export function aCatalogo(monedaBase: string, ins: FilaInsumo[], mats: FilaMatriz[], renglones: Map<string, FilaRenglonMatriz[]>): Catalogo {
  return {
    monedaBase,
    insumos: ins.map((i) => ({
      clave: i.clave,
      tipo: i.tipo,
      costo: { [i.moneda]: i.costo },
      porcentajeDeManoDeObra: i.porcentajeManoObra,
      ...(i.salarioBase !== null && i.fsr !== null ? { salarioBase: i.salarioBase, fsr: i.fsr } : {}),
    })),
    matrices: mats.map((m) => ({
      clave: m.clave,
      tipo: m.tipo,
      renglones: (renglones.get(m.id) ?? []).map((r) => ({ componente: r.componente, cantidad: r.cantidad })),
    })),
  };
}

@Injectable()
export class CatalogoService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async presupuesto(id: string) {
    const [p] = await this.db.select().from(presupuestos).where(eq(presupuestos.id, id));
    if (!p) throw new NotFoundException('Presupuesto no encontrado');
    return p;
  }

  /** Carga insumos y matrices de un presupuesto y arma el motor de cálculo. */
  async cargar(presupuestoId: string): Promise<CatalogoCargado> {
    const presupuesto = await this.presupuesto(presupuestoId);
    const [ins, mats] = await Promise.all([
      this.db.select().from(insumos).where(eq(insumos.presupuestoId, presupuestoId)).orderBy(asc(insumos.clave)),
      this.db.select().from(matrices).where(eq(matrices.presupuestoId, presupuestoId)).orderBy(asc(matrices.clave)),
    ]);
    const filas = mats.length
      ? await this.db
          .select()
          .from(matrizRenglones)
          .where(inArray(matrizRenglones.matrizId, mats.map((m) => m.id)))
          .orderBy(asc(matrizRenglones.orden))
      : [];
    const renglones = new Map<string, FilaRenglonMatriz[]>();
    for (const r of filas) renglones.set(r.matrizId, [...(renglones.get(r.matrizId) ?? []), r]);
    const motor = this.motor(presupuesto.monedaBase, ins, mats, renglones);
    return { presupuesto, insumos: ins, matrices: mats, renglones, motor };
  }

  motor(monedaBase: string, ins: FilaInsumo[], mats: FilaMatriz[], renglones: Map<string, FilaRenglonMatriz[]>) {
    try {
      return new MotorApu(aCatalogo(monedaBase, ins, mats, renglones));
    } catch (e) {
      throw traducirErrorDeCatalogo(e);
    }
  }
}

export function traducirErrorDeCatalogo(e: unknown): unknown {
  return e instanceof ErrorDeCatalogo ? new BadRequestException(e.message) : e;
}
