import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, isNull, max, sql } from 'drizzle-orm';
import { calcularPresupuesto, MontosTexto, RenglonPresupuesto } from '@puselfhost/motor-pu';
import { DB, Db } from '../db/db.module';
import { insumos, matrices, matrizRenglones, presupuestoRenglones, presupuestos, TIPOS_INSUMO, TIPOS_MATRIZ } from '../db/schema';
import { CatalogoService, traducirErrorDeCatalogo } from './catalogo.service';

type TipoInsumo = (typeof TIPOS_INSUMO)[number];
type TipoMatriz = (typeof TIPOS_MATRIZ)[number];

export interface RenglonArbol {
  id: string;
  padreId: string | null;
  tipo: 'partida' | 'concepto';
  clave: string;
  descripcion: string;
  unidad: string;
  matrizId: string | null;
  /** Clave de la matriz del concepto; puede ser distinta de la clave del concepto. */
  matrizClave: string | null;
  cantidad: string | null;
  precioUnitario?: MontosTexto;
  importe: MontosTexto;
}

export interface DatosInsumo {
  clave: string;
  descripcion: string;
  unidad: string;
  tipo: TipoInsumo;
  costo: string;
  moneda: string;
  porcentajeManoObra: boolean;
  salarioBase: string | null;
  fsr: string | null;
}

const PG_UNIQUE_VIOLATION = '23505';
const PG_FK_VIOLATION = '23503';
const codigoPg = (e: unknown) => (e as { cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code;

@Injectable()
export class PresupuestosService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly catalogo: CatalogoService,
  ) {}

  // --- Presupuestos -------------------------------------------------------

  async listar() {
    return this.db
      .select({
        id: presupuestos.id,
        nombre: presupuestos.nombre,
        cliente: presupuestos.cliente,
        origen: presupuestos.origen,
        actualizadoEn: presupuestos.actualizadoEn,
        conceptos: sql<number>`(select count(*)::int from ${presupuestoRenglones} r where r.presupuesto_id = ${presupuestos.id} and r.tipo = 'concepto')`,
      })
      .from(presupuestos)
      .orderBy(desc(presupuestos.actualizadoEn));
  }

  async crear(datos: { nombre: string; cliente?: string; ubicacion?: string }, usuarioId: string) {
    const [p] = await this.db.insert(presupuestos).values({ ...datos, creadoPor: usuarioId }).returning();
    return p;
  }

  async actualizar(id: string, cambios: { nombre?: string; cliente?: string | null; ubicacion?: string | null }) {
    const [p] = await this.db.update(presupuestos).set({ ...cambios, actualizadoEn: new Date() }).where(eq(presupuestos.id, id)).returning();
    if (!p) throw new NotFoundException('Presupuesto no encontrado');
    return p;
  }

  async eliminar(id: string) {
    await this.catalogo.presupuesto(id);
    await this.db.transaction(async (tx) => {
      // El árbol referencia matrices con "restrict": se borra primero.
      await tx.delete(presupuestoRenglones).where(eq(presupuestoRenglones.presupuestoId, id));
      await tx.delete(presupuestos).where(eq(presupuestos.id, id));
    });
  }

  private tocar(id: string) {
    return this.db.update(presupuestos).set({ actualizadoEn: new Date() }).where(eq(presupuestos.id, id));
  }

  // --- Árbol del presupuesto ----------------------------------------------

  /** Datos del presupuesto con su árbol de partidas y conceptos ya calculado. */
  async detalle(id: string) {
    const cat = await this.catalogo.cargar(id);
    const filas = await this.db
      .select()
      .from(presupuestoRenglones)
      .where(eq(presupuestoRenglones.presupuestoId, id))
      .orderBy(asc(presupuestoRenglones.orden));
    const matrizPorId = new Map(cat.matrices.map((m) => [m.id, m]));

    const entrada: RenglonPresupuesto[] = filas.map((f) =>
      f.tipo === 'concepto'
        ? { id: f.id, padre: f.padreId ?? undefined, tipo: 'concepto', matriz: matrizPorId.get(f.matrizId!)!.clave, cantidad: f.cantidad ?? '0' }
        : { id: f.id, padre: f.padreId ?? undefined, tipo: 'partida' },
    );
    let calculo;
    try {
      calculo = calcularPresupuesto(cat.motor, entrada);
    } catch (e) {
      throw traducirErrorDeCatalogo(e);
    }

    const renglones: RenglonArbol[] = filas.map((f) => {
      const c = calculo.renglones.get(f.id)!;
      const m = f.matrizId ? matrizPorId.get(f.matrizId) : undefined;
      return {
        id: f.id,
        padreId: f.padreId,
        tipo: f.tipo,
        clave: f.clave,
        descripcion: f.descripcion,
        unidad: f.unidad,
        matrizId: f.matrizId,
        matrizClave: m?.clave ?? null,
        cantidad: f.cantidad,
        precioUnitario: c.precioUnitario,
        importe: c.importe,
      };
    });
    return { presupuesto: cat.presupuesto, renglones, total: calculo.total };
  }

  private async siguienteOrden(presupuestoId: string, padreId: string | null) {
    const [{ m }] = await this.db
      .select({ m: max(presupuestoRenglones.orden) })
      .from(presupuestoRenglones)
      .where(
        and(
          eq(presupuestoRenglones.presupuestoId, presupuestoId),
          padreId ? eq(presupuestoRenglones.padreId, padreId) : isNull(presupuestoRenglones.padreId),
        ),
      );
    return (m ?? 0) + 10;
  }

  private async renglon(presupuestoId: string, renglonId: string) {
    const [r] = await this.db
      .select()
      .from(presupuestoRenglones)
      .where(and(eq(presupuestoRenglones.id, renglonId), eq(presupuestoRenglones.presupuestoId, presupuestoId)));
    if (!r) throw new NotFoundException('Renglón no encontrado');
    return r;
  }

  async agregarPartida(presupuestoId: string, datos: { padreId?: string | null; clave: string; descripcion: string }) {
    await this.catalogo.presupuesto(presupuestoId);
    const padreId = datos.padreId ?? null;
    if (padreId && (await this.renglon(presupuestoId, padreId)).tipo !== 'partida') {
      throw new BadRequestException('Solo se puede agregar dentro de una partida');
    }
    const [r] = await this.db
      .insert(presupuestoRenglones)
      .values({ presupuestoId, padreId, tipo: 'partida', clave: datos.clave, descripcion: datos.descripcion, orden: await this.siguienteOrden(presupuestoId, padreId) })
      .returning();
    await this.tocar(presupuestoId);
    return r;
  }

  /**
   * Agrega un concepto. Con `matrizId` se liga a una matriz existente (la clave y descripción del concepto
   * pueden ser otras); con `nueva` crea una matriz vacía con esos datos.
   */
  async agregarConcepto(
    presupuestoId: string,
    datos: {
      padreId?: string | null;
      cantidad: string;
      matrizId?: string;
      clave?: string;
      descripcion?: string;
      nueva?: { clave: string; descripcion: string; unidad: string };
    },
  ) {
    await this.catalogo.presupuesto(presupuestoId);
    const padreId = datos.padreId ?? null;
    if (padreId && (await this.renglon(presupuestoId, padreId)).tipo !== 'partida') {
      throw new BadRequestException('Los conceptos van dentro de una partida');
    }
    const orden = await this.siguienteOrden(presupuestoId, padreId);
    const r = await this.db.transaction(async (tx) => {
      let matriz;
      if (datos.matrizId) {
        [matriz] = await tx.select().from(matrices).where(and(eq(matrices.id, datos.matrizId), eq(matrices.presupuestoId, presupuestoId)));
        if (!matriz) throw new NotFoundException('Matriz no encontrada');
      } else if (datos.nueva) {
        await this.validarClaveLibre(presupuestoId, datos.nueva.clave);
        [matriz] = await tx.insert(matrices).values({ presupuestoId, ...datos.nueva, tipo: 'concepto' }).returning();
      } else {
        throw new BadRequestException('Indica la matriz del concepto o los datos de uno nuevo');
      }
      const [fila] = await tx
        .insert(presupuestoRenglones)
        .values({
          presupuestoId,
          padreId,
          tipo: 'concepto',
          matrizId: matriz.id,
          clave: datos.clave || matriz.clave,
          descripcion: datos.descripcion || matriz.descripcion,
          unidad: matriz.unidad,
          cantidad: datos.cantidad,
          orden,
        })
        .returning();
      return fila;
    });
    await this.tocar(presupuestoId);
    return r;
  }

  async actualizarRenglon(
    presupuestoId: string,
    renglonId: string,
    cambios: { clave?: string; descripcion?: string; unidad?: string; cantidad?: string; matrizId?: string },
  ) {
    const actual = await this.renglon(presupuestoId, renglonId);
    if (actual.tipo === 'partida' && (cambios.cantidad !== undefined || cambios.matrizId !== undefined || cambios.unidad !== undefined)) {
      throw new BadRequestException('Las partidas no llevan cantidad, unidad ni matriz');
    }
    if (cambios.matrizId) {
      const [m] = await this.db.select().from(matrices).where(and(eq(matrices.id, cambios.matrizId), eq(matrices.presupuestoId, presupuestoId)));
      if (!m) throw new NotFoundException('Matriz no encontrada');
    }
    const [r] = await this.db.update(presupuestoRenglones).set(cambios).where(eq(presupuestoRenglones.id, renglonId)).returning();
    await this.tocar(presupuestoId);
    return r;
  }

  async eliminarRenglon(presupuestoId: string, renglonId: string) {
    await this.renglon(presupuestoId, renglonId);
    await this.db.delete(presupuestoRenglones).where(eq(presupuestoRenglones.id, renglonId));
    await this.tocar(presupuestoId);
  }

  // --- Insumos ------------------------------------------------------------

  async insumos(presupuestoId: string) {
    const cat = await this.catalogo.cargar(presupuestoId);
    return cat.insumos.map((i) => ({
      ...i,
      // Costo efectivo (mano de obra con FSR se calcula); los % de mano de obra no tienen costo propio.
      costoCalculado: i.porcentajeManoObra ? null : cat.motor.costo(i.clave).en(i.moneda).toFixed(2),
    }));
  }

  private async validarClaveLibre(presupuestoId: string, clave: string, excepto?: string) {
    const [a, b] = await Promise.all([
      this.db.select({ id: insumos.id }).from(insumos).where(and(eq(insumos.presupuestoId, presupuestoId), eq(insumos.clave, clave))),
      this.db.select({ id: matrices.id }).from(matrices).where(and(eq(matrices.presupuestoId, presupuestoId), eq(matrices.clave, clave))),
    ]);
    if ([...a, ...b].some((x) => x.id !== excepto)) throw new ConflictException(`Ya existe la clave ${clave} en este presupuesto`);
  }

  async crearInsumo(presupuestoId: string, datos: DatosInsumo) {
    await this.catalogo.presupuesto(presupuestoId);
    await this.validarClaveLibre(presupuestoId, datos.clave);
    const [i] = await this.db.insert(insumos).values({ presupuestoId, ...datos }).returning();
    await this.tocar(presupuestoId);
    return i;
  }

  async actualizarInsumo(presupuestoId: string, insumoId: string, cambios: Partial<Omit<DatosInsumo, 'clave'>>) {
    const [i] = await this.db
      .update(insumos)
      .set(cambios)
      .where(and(eq(insumos.id, insumoId), eq(insumos.presupuestoId, presupuestoId)))
      .returning();
    if (!i) throw new NotFoundException('Insumo no encontrado');
    await this.tocar(presupuestoId);
    return i;
  }

  async eliminarInsumo(presupuestoId: string, insumoId: string) {
    const [i] = await this.db.select().from(insumos).where(and(eq(insumos.id, insumoId), eq(insumos.presupuestoId, presupuestoId)));
    if (!i) throw new NotFoundException('Insumo no encontrado');
    const [{ n }] = await this.db
      .select({ n: count() })
      .from(matrizRenglones)
      .innerJoin(matrices, eq(matrices.id, matrizRenglones.matrizId))
      .where(and(eq(matrices.presupuestoId, presupuestoId), eq(matrizRenglones.componente, i.clave)));
    if (n > 0) throw new ConflictException(`No se puede borrar: ${i.clave} se usa en ${n} análisis`);
    await this.db.delete(insumos).where(eq(insumos.id, insumoId));
    await this.tocar(presupuestoId);
  }

  // --- Matrices (análisis de precio unitario) -----------------------------

  async matrices(presupuestoId: string) {
    const cat = await this.catalogo.cargar(presupuestoId);
    return cat.matrices.map((m) => ({ ...m, costoDirecto: cat.motor.matriz(m.clave).costoDirecto }));
  }

  async matriz(presupuestoId: string, matrizId: string) {
    const cat = await this.catalogo.cargar(presupuestoId);
    const m = cat.matrices.find((x) => x.id === matrizId);
    if (!m) throw new NotFoundException('Matriz no encontrada');
    let calc;
    try {
      calc = cat.motor.matriz(m.clave);
    } catch (e) {
      throw traducirErrorDeCatalogo(e);
    }
    const insumoPorClave = new Map(cat.insumos.map((i) => [i.clave, i]));
    const matrizPorClave = new Map(cat.matrices.map((x) => [x.clave, x]));
    const filas = cat.renglones.get(m.id) ?? [];
    return {
      ...m,
      costoDirecto: calc.costoDirecto,
      porTipo: calc.porTipo,
      renglones: calc.renglones.map((r, i) => {
        const comp = insumoPorClave.get(r.componente) ?? matrizPorClave.get(r.componente)!;
        return {
          id: filas[i].id,
          componente: r.componente,
          esMatriz: matrizPorClave.has(r.componente),
          componenteId: comp.id,
          descripcion: comp.descripcion,
          unidad: comp.unidad,
          tipo: r.tipo,
          porcentajeManoObra: insumoPorClave.get(r.componente)?.porcentajeManoObra ?? false,
          cantidad: filas[i].cantidad,
          costo: r.costo,
          importe: r.importe,
        };
      }),
    };
  }

  async actualizarMatriz(presupuestoId: string, matrizId: string, cambios: { clave?: string; descripcion?: string; unidad?: string; tipo?: TipoMatriz }) {
    if (cambios.clave) await this.validarClaveLibre(presupuestoId, cambios.clave, matrizId);
    try {
      return await this.db.transaction(async (tx) => {
        const [anterior] = await tx.select().from(matrices).where(and(eq(matrices.id, matrizId), eq(matrices.presupuestoId, presupuestoId)));
        if (!anterior) throw new NotFoundException('Matriz no encontrada');
        const [m] = await tx.update(matrices).set(cambios).where(eq(matrices.id, matrizId)).returning();
        if (cambios.unidad !== undefined && cambios.unidad !== anterior.unidad) {
          // La unidad viaja con la matriz a los conceptos que la usan y aún tenían la anterior.
          await tx
            .update(presupuestoRenglones)
            .set({ unidad: cambios.unidad })
            .where(and(eq(presupuestoRenglones.matrizId, matrizId), eq(presupuestoRenglones.unidad, anterior.unidad)));
        }
        if (cambios.clave && cambios.clave !== anterior.clave) {
          // Los renglones guardan el componente por clave: se renombra en los análisis que lo usan.
          await tx.execute(sql`
            update ${matrizRenglones} r set componente = ${cambios.clave}
            from ${matrices} m where m.id = r.matriz_id and m.presupuesto_id = ${presupuestoId} and r.componente = ${anterior.clave}`);
        }
        return m;
      });
    } finally {
      await this.tocar(presupuestoId);
    }
  }

  /** Reemplaza los renglones de un análisis. Valida que los componentes existan y que no haya ciclos. */
  async guardarRenglonesMatriz(presupuestoId: string, matrizId: string, renglones: { componente: string; cantidad: string }[]) {
    const cat = await this.catalogo.cargar(presupuestoId);
    const m = cat.matrices.find((x) => x.id === matrizId);
    if (!m) throw new NotFoundException('Matriz no encontrada');

    const nuevos = renglones.map((r, i) => ({ id: '', matrizId, orden: (i + 1) * 10, componente: r.componente.trim(), cantidad: r.cantidad }));
    const prueba = new Map(cat.renglones).set(matrizId, nuevos);
    try {
      this.catalogo.motor(cat.presupuesto.monedaBase, cat.insumos, cat.matrices, prueba).matriz(m.clave);
    } catch (e) {
      throw traducirErrorDeCatalogo(e);
    }

    await this.db.transaction(async (tx) => {
      await tx.delete(matrizRenglones).where(eq(matrizRenglones.matrizId, matrizId));
      if (nuevos.length) await tx.insert(matrizRenglones).values(nuevos.map(({ id: _, ...r }) => r));
    });
    await this.tocar(presupuestoId);
    return this.matriz(presupuestoId, matrizId);
  }

  async crearMatriz(presupuestoId: string, datos: { clave: string; descripcion: string; unidad: string; tipo: TipoMatriz }) {
    await this.catalogo.presupuesto(presupuestoId);
    await this.validarClaveLibre(presupuestoId, datos.clave);
    try {
      const [m] = await this.db.insert(matrices).values({ presupuestoId, ...datos }).returning();
      await this.tocar(presupuestoId);
      return m;
    } catch (e) {
      throw codigoPg(e) === PG_UNIQUE_VIOLATION ? new ConflictException(`Ya existe la clave ${datos.clave}`) : e;
    }
  }

  async eliminarMatriz(presupuestoId: string, matrizId: string) {
    const cat = await this.catalogo.cargar(presupuestoId);
    const m = cat.matrices.find((x) => x.id === matrizId);
    if (!m) throw new NotFoundException('Matriz no encontrada');
    const usada = cat.matrices.filter((x) => (cat.renglones.get(x.id) ?? []).some((r) => r.componente === m.clave));
    if (usada.length) throw new ConflictException(`No se puede borrar: ${m.clave} se usa en ${usada.map((x) => x.clave).join(', ')}`);
    try {
      await this.db.delete(matrices).where(eq(matrices.id, matrizId));
    } catch (e) {
      throw codigoPg(e) === PG_FK_VIOLATION ? new ConflictException(`No se puede borrar: ${m.clave} está en el presupuesto`) : e;
    }
    await this.tocar(presupuestoId);
  }
}
