import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';
import { DB, Db } from '../db/db.module';
import { Rol, Usuario, usuarios } from '../db/schema';
import { hashPassword } from '../auth/passwords';

export interface UsuarioPublico {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
  creadoEn: Date;
}

export const aPublico = ({ passwordHash: _omitido, actualizadoEn: _a, ...u }: Usuario): UsuarioPublico => u;

const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class UsersService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async buscarPorEmail(email: string): Promise<Usuario | undefined> {
    const [u] = await this.db
      .select()
      .from(usuarios)
      .where(sql`lower(${usuarios.email}) = lower(${email})`);
    return u;
  }

  async listar(): Promise<UsuarioPublico[]> {
    const filas = await this.db.select().from(usuarios).orderBy(asc(usuarios.nombre));
    return filas.map(aPublico);
  }

  async contar(): Promise<number> {
    const [{ n }] = await this.db.select({ n: sql<number>`count(*)::int` }).from(usuarios);
    return n;
  }

  async crear(datos: { email: string; nombre: string; password: string; rol: Rol }): Promise<UsuarioPublico> {
    try {
      const [u] = await this.db
        .insert(usuarios)
        .values({ email: datos.email, nombre: datos.nombre, rol: datos.rol, passwordHash: await hashPassword(datos.password) })
        .returning();
      return aPublico(u);
    } catch (e) {
      throw this.traducirError(e);
    }
  }

  async actualizar(
    id: string,
    cambios: { email?: string; nombre?: string; password?: string; rol?: Rol; activo?: boolean },
  ): Promise<UsuarioPublico> {
    const { password, ...resto } = cambios;
    try {
      const [u] = await this.db
        .update(usuarios)
        .set({ ...resto, ...(password ? { passwordHash: await hashPassword(password) } : {}), actualizadoEn: new Date() })
        .where(eq(usuarios.id, id))
        .returning();
      if (!u) throw new NotFoundException('Usuario no encontrado');
      return aPublico(u);
    } catch (e) {
      throw this.traducirError(e);
    }
  }

  private traducirError(e: unknown): unknown {
    const code = (e as { code?: string; cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code;
    return code === PG_UNIQUE_VIOLATION ? new ConflictException('Ya existe un usuario con ese correo') : e;
  }
}
