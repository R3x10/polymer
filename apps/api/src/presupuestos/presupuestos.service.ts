import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, asc, count, desc, eq, isNull, max, sql } from 'drizzle-orm';
import { calcularCuantificacion, calcularPresupuesto, ErrorDeFormula, MontosTexto, RenglonPresupuesto } from '@puselfhost/motor-pu';
import { DB, Db } from '../db/db.module';
import { porLotes } from '../db/lotes';
import {
  cuantificaciones,
  ESTADOS_PRESUPUESTO,
  ETAPAS_PRESUPUESTO,
  insumos,
  matrices,
  matrizRenglones,
  presupuestoRenglones,
  presupuestos,
  proyectos,
  TIPOS_INSUMO,
  TIPOS_MATRIZ,
  TIPOS_PRESUPUESTO,
} from '../db/schema';
import { CatalogoService, traducirErrorDeCatalogo } from './catalogo.service';
import { ProyectosService } from './proyectos.service';

type TipoInsumo = (typeof TIPOS_INSUMO)[number];
type TipoMatriz = (typeof TIPOS_MATRIZ)[number];

export interface DatosPresupuesto {
  nombre: string;
  tipo: (typeof TIPOS_PRESUPUESTO)[number];
  etapa: (typeof ETAPAS_PRESUPUESTO)[number];
  estado: (typeof ESTADOS_PRESUPUESTO)[number];
  monedaBase: string;
  proyectoId: string;
}

export interface DatosCuantificacion {
  descripcion: string;
  eje: string;
  piezas: string | null;
  largo: string | null;
  ancho: string | null;
  alto: string | null;
  formula: string;
}

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
  /** La cantidad sale de su cuantificación y no se captura directo. */
  cuantificado: boolean;
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
    private readonly proyectos: ProyectosService,
  ) {}

  // --- Presupuestos -------------------------------------------------------

  async listar() {
    return this.db
      .select({
        id: presupuestos.id,
        nombre: presupuestos.nombre,
        proyectoId: presupuestos.proyectoId,
        proyecto: proyectos.nombre,
        cliente: proyectos.cliente,
        tipo: presupuestos.tipo,
        etapa: presupuestos.etapa,
        estado: presupuestos.estado,
        origen: presupuestos.origen,
        actualizadoEn: presupuestos.actualizadoEn,
        conceptos: sql<number>`(select count(*)::int from ${presupuestoRenglones} r where r.presupuesto_id = "presupuestos"."id" and r.tipo = 'concepto')`,
      })
      .from(presupuestos)
      .innerJoin(proyectos, eq(proyectos.id, presupuestos.proyectoId))
      .orderBy(desc(presupuestos.actualizadoEn));
  }

  /** Crea un presupuesto en un proyecto existente (`proyectoId`) o en uno que se busca o crea por nombre. */
  async crear(datos: Partial<Omit<DatosPresupuesto, 'estado'>> & { nombre: string; proyecto?: string }, usuarioId: string) {
    const { proyecto: nombreProyecto, ...resto } = datos;
    let proyectoId = datos.proyectoId;
    if (proyectoId) await this.proyectos.obtener(proyectoId);
    else if (nombreProyecto) proyectoId = (await this.proyectos.buscarOCrear({ nombre: nombreProyecto })).id;
    else throw new BadRequestException('Indica el proyecto del presupuesto');
    const [p] = await this.db.insert(presupuestos).values({ ...resto, proyectoId, creadoPor: usuarioId }).returning();
    return p;
  }

  async actualizar(id: string, cambios: Partial<DatosPresupuesto>) {
    const actual = await this.catalogo.presupuesto(id);
    if (actual.estado === 'congelado' && Object.keys(cambios).some((k) => k !== 'estado')) {
      throw new ConflictException('El presupuesto está congelado: cambia su estado para modificarlo');
    }
    if (cambios.proyectoId) await this.proyectos.obtener(cambios.proyectoId);
    const [p] = await this.db.update(presupuestos).set({ ...cambios, actualizadoEn: new Date() }).where(eq(presupuestos.id, id)).returning();
    return p;
  }

  /** Falla si el presupuesto está congelado. Se llama antes de cualquier cambio a su contenido. */
  private async editable(id: string) {
    const p = await this.catalogo.presupuesto(id);
    this.validarEditable(p);
    return p;
  }

  private validarEditable(p: { estado: string }) {
    if (p.estado === 'congelado') throw new ConflictException('El presupuesto está congelado: cambia su estado para modificarlo');
  }

  async eliminar(id: string) {
    await this.editable(id);
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
    const [proyecto, cuantificados] = await Promise.all([this.proyectos.obtener(cat.presupuesto.proyectoId), this.cuantificados(id)]);

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
        cuantificado: cuantificados.has(f.id),
        precioUnitario: c.precioUnitario,
        importe: c.importe,
      };
    });
    return { presupuesto: cat.presupuesto, proyecto, renglones, total: calculo.total };
  }

  /** Ids de los conceptos del presupuesto que tienen cuantificación. */
  private async cuantificados(presupuestoId: string) {
    const filas = await this.db
      .selectDistinct({ id: cuantificaciones.renglonId })
      .from(cuantificaciones)
      .innerJoin(presupuestoRenglones, eq(presupuestoRenglones.id, cuantificaciones.renglonId))
      .where(eq(presupuestoRenglones.presupuestoId, presupuestoId));
    return new Set(filas.map((f) => f.id));
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
    await this.editable(presupuestoId);
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
    await this.editable(presupuestoId);
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
    await this.editable(presupuestoId);
    const actual = await this.renglon(presupuestoId, renglonId);
    if (cambios.cantidad !== undefined && (await this.cuantificados(presupuestoId)).has(renglonId)) {
      throw new BadRequestException('La cantidad de este concepto sale de su cuantificación');
    }
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
    await this.editable(presupuestoId);
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
    await this.editable(presupuestoId);
    await this.validarClaveLibre(presupuestoId, datos.clave);
    const [i] = await this.db.insert(insumos).values({ presupuestoId, ...datos }).returning();
    await this.tocar(presupuestoId);
    return i;
  }

  async actualizarInsumo(presupuestoId: string, insumoId: string, cambios: Partial<Omit<DatosInsumo, 'clave'>>) {
    await this.editable(presupuestoId);
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
    await this.editable(presupuestoId);
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
    await this.editable(presupuestoId);
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
    this.validarEditable(cat.presupuesto);
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
    await this.editable(presupuestoId);
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
    this.validarEditable(cat.presupuesto);
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

  // --- Cuantificación (generadores) ---------------------------------------

  async cuantificacion(presupuestoId: string, renglonId: string) {
    const r = await this.renglon(presupuestoId, renglonId);
    if (r.tipo !== 'concepto') throw new BadRequestException('Solo los conceptos llevan cuantificación');
    const filas = await this.db.select().from(cuantificaciones).where(eq(cuantificaciones.renglonId, renglonId)).orderBy(asc(cuantificaciones.orden));
    const calculo = this.calcularCuantificacion(filas);
    return {
      renglonId,
      clave: r.clave,
      descripcion: r.descripcion,
      unidad: r.unidad,
      cantidad: r.cantidad,
      renglones: filas.map((f, i) => ({ ...f, resultado: calculo.resultados[i] })),
      total: calculo.total,
    };
  }

  private calcularCuantificacion(filas: Omit<DatosCuantificacion, 'descripcion' | 'eje'>[]) {
    try {
      return calcularCuantificacion(filas);
    } catch (e) {
      throw e instanceof ErrorDeFormula ? new BadRequestException(e.message) : e;
    }
  }

  /**
   * Reemplaza la cuantificación de un concepto y le pone como cantidad la suma de sus renglones.
   * Sin renglones, el concepto conserva su última cantidad y vuelve a capturarse a mano.
   */
  async guardarCuantificacion(presupuestoId: string, renglonId: string, filas: DatosCuantificacion[]) {
    await this.editable(presupuestoId);
    const r = await this.renglon(presupuestoId, renglonId);
    if (r.tipo !== 'concepto') throw new BadRequestException('Solo los conceptos llevan cuantificación');
    const calculo = this.calcularCuantificacion(filas);
    await this.db.transaction(async (tx) => {
      await tx.delete(cuantificaciones).where(eq(cuantificaciones.renglonId, renglonId));
      if (filas.length) {
        await tx.insert(cuantificaciones).values(filas.map((f, i) => ({ ...f, renglonId, orden: (i + 1) * 10 })));
        await tx.update(presupuestoRenglones).set({ cantidad: calculo.total }).where(eq(presupuestoRenglones.id, renglonId));
      }
    });
    await this.tocar(presupuestoId);
    return this.cuantificacion(presupuestoId, renglonId);
  }

  // --- Duplicar ------------------------------------------------------------

  /**
   * Copia completa de un presupuesto (catálogo, árbol y cuantificaciones) en el mismo proyecto,
   * por ejemplo para pasar de venta a costo o de inicial a planificado. La copia empieza en borrador.
   */
  async duplicar(presupuestoId: string, datos: Partial<Pick<DatosPresupuesto, 'nombre' | 'tipo' | 'etapa' | 'proyectoId'>>, usuarioId: string) {
    const origen = await this.catalogo.presupuesto(presupuestoId);
    if (datos.proyectoId) await this.proyectos.obtener(datos.proyectoId);
    return this.db.transaction(async (tx) => {
      const [copia] = await tx
        .insert(presupuestos)
        .values({
          proyectoId: datos.proyectoId ?? origen.proyectoId,
          nombre: datos.nombre ?? `${origen.nombre} (copia)`,
          tipo: datos.tipo ?? origen.tipo,
          etapa: datos.etapa ?? origen.etapa,
          monedaBase: origen.monedaBase,
          origen: origen.origen,
          creadoPor: usuarioId,
        })
        .returning();

      const ins = await tx.select().from(insumos).where(eq(insumos.presupuestoId, presupuestoId));
      await porLotes(ins, (lote) => tx.insert(insumos).values(lote.map(({ id: _, ...i }) => ({ ...i, presupuestoId: copia.id }))));

      const mats = await tx.select().from(matrices).where(eq(matrices.presupuestoId, presupuestoId));
      const idMatriz = new Map(mats.map((m) => [m.id, randomUUID()]));
      await porLotes(mats, (lote) => tx.insert(matrices).values(lote.map((m) => ({ ...m, id: idMatriz.get(m.id)!, presupuestoId: copia.id }))));
      const rms = (
        await tx.select().from(matrizRenglones).innerJoin(matrices, eq(matrices.id, matrizRenglones.matrizId)).where(eq(matrices.presupuestoId, presupuestoId))
      ).map((f) => f.matriz_renglones);
      await porLotes(rms, (lote) => tx.insert(matrizRenglones).values(lote.map(({ id: _, ...r }) => ({ ...r, matrizId: idMatriz.get(r.matrizId)! }))));

      // El árbol se inserta por nivel para que cada padre exista antes que sus hijos.
      const arbol = await tx.select().from(presupuestoRenglones).where(eq(presupuestoRenglones.presupuestoId, presupuestoId));
      const idRenglon = new Map(arbol.map((r) => [r.id, randomUUID()]));
      const padreDe = new Map(arbol.map((r) => [r.id, r.padreId]));
      const nivel = (id: string | null): number => (id ? 1 + nivel(padreDe.get(id) ?? null) : 0);
      const ordenados = [...arbol].sort((a, b) => nivel(a.id) - nivel(b.id));
      await porLotes(ordenados, (lote) =>
        tx.insert(presupuestoRenglones).values(
          lote.map((r) => ({
            ...r,
            id: idRenglon.get(r.id)!,
            presupuestoId: copia.id,
            padreId: r.padreId ? idRenglon.get(r.padreId)! : null,
            matrizId: r.matrizId ? idMatriz.get(r.matrizId)! : null,
          })),
        ),
      );
      const cuants = (
        await tx
          .select()
          .from(cuantificaciones)
          .innerJoin(presupuestoRenglones, eq(presupuestoRenglones.id, cuantificaciones.renglonId))
          .where(eq(presupuestoRenglones.presupuestoId, presupuestoId))
      ).map((f) => f.cuantificaciones);
      await porLotes(cuants, (lote) => tx.insert(cuantificaciones).values(lote.map(({ id: _, ...c }) => ({ ...c, renglonId: idRenglon.get(c.renglonId)! }))));
      return copia;
    });
  }
}
