import { CallHandler, ExecutionContext, Inject, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { DB, Db } from '../db/db.module';
import { bitacora } from '../db/schema';
import { SesionUsuario } from '../auth/decorators';

const MODIFICAN = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const OCULTOS = new Set(['password', 'passwordHash']);

/** Copia del cuerpo sin contraseñas, para guardarla en la bitácora. */
export function limpiar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(limpiar);
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, OCULTOS.has(k) ? '***' : limpiar(v)]));
  }
  return valor;
}

/** Registra en la bitácora cada petición que modifica datos y terminó bien. */
@Injectable()
export class BitacoraInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Bitacora');

  constructor(@Inject(DB) private readonly db: Db) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    if (!MODIFICAN.has(req.method)) return next.handle();
    return next.handle().pipe(
      tap(() => {
        const usuario: SesionUsuario | undefined = req.usuario;
        const res = ctx.switchToHttp().getResponse();
        const archivo = req.file ? { archivo: { nombre: req.file.originalname, bytes: req.file.size } } : {};
        this.db
          .insert(bitacora)
          .values({
            usuarioId: usuario?.id ?? null,
            metodo: req.method,
            ruta: req.originalUrl ?? req.url,
            estado: res.statusCode,
            datos: { ...(limpiar(req.body ?? {}) as object), ...archivo },
          })
          .catch((e: unknown) => this.logger.error(`No se pudo registrar en la bitácora: ${String(e)}`));
      }),
    );
  }
}
