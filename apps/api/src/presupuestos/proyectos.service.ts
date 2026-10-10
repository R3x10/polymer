import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';
import { DB, Db, Tx } from '../db/db.module';
import { presupuestos, proyectos, TIPOS_PROYECTO } from '../db/schema';

type TipoProyecto = (typeof TIPOS_PROYECTO)[number];
export interface DatosProyecto {
  nombre: string;
  tipo?: TipoProyecto;
  cliente?: string | null;
  ubicacion?: string | null;
}

const PG_UNIQUE_VIOLATION = '23505';
const codigoPg = (e: unknown) => (e as { cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code;

/** Proyectos (obras o centros de costos): agrupan los presupuestos de una misma obra. */
@Injectable()
export class ProyectosService {
  constructor(@Inject(DB) private readonly db: Db) {}

  listar() {
    return this.db
      .select({
        id: proyectos.id,
        nombre: proyectos.nombre,
        tipo: proyectos.tipo,
        cliente: proyectos.cliente,
        ubicacion: proyectos.ubicacion,
        presupuestos: sql<number>`(select count(*)::int from ${presupuestos} p where p.proyecto_id = "proyectos"."id")`,
      })
      .from(proyectos)
      .orderBy(asc(proyectos.nombre));
  }

  async obtener(id: string, db: Db | Tx = this.db) {
    const [p] = await db.select().from(proyectos).where(eq(proyectos.id, id));
    if (!p) throw new NotFoundException('Proyecto no encontrado');
    return p;
  }

  /** Busca el proyecto por nombre (sin distinguir mayúsculas) o lo crea. */
  async buscarOCrear(datos: DatosProyecto, db: Db | Tx = this.db) {
    const nombre = datos.nombre.trim();
    const [existente] = await db.select().from(proyectos).where(sql`lower(${proyectos.nombre}) = lower(${nombre})`);
    if (existente) return existente;
    const [p] = await db.insert(proyectos).values({ ...datos, nombre }).returning();
    return p;
  }

  async crear(datos: DatosProyecto) {
    try {
      const [p] = await this.db.insert(proyectos).values(datos).returning();
      return p;
    } catch (e) {
      throw codigoPg(e) === PG_UNIQUE_VIOLATION ? new ConflictException(`Ya existe el proyecto ${datos.nombre}`) : e;
    }
  }

  async actualizar(id: string, cambios: Partial<DatosProyecto>) {
    try {
      const [p] = await this.db.update(proyectos).set(cambios).where(eq(proyectos.id, id)).returning();
      if (!p) throw new NotFoundException('Proyecto no encontrado');
      return p;
    } catch (e) {
      throw codigoPg(e) === PG_UNIQUE_VIOLATION ? new ConflictException(`Ya existe el proyecto ${cambios.nombre}`) : e;
    }
  }

  async eliminar(id: string) {
    await this.obtener(id);
    const [{ n }] = await this.db.select({ n: sql<number>`count(*)::int` }).from(presupuestos).where(eq(presupuestos.proyectoId, id));
    if (n > 0) throw new ConflictException(`No se puede borrar: el proyecto tiene ${n} presupuesto${n === 1 ? '' : 's'}`);
    await this.db.delete(proyectos).where(eq(proyectos.id, id));
  }
}
