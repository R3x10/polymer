import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import { DB, Db } from '../db/db.module';
import { Rol, usuarios } from '../db/schema';
import { IS_PUBLIC, ROLES_KEY, SesionUsuario } from './decorators';

/**
 * Guard global: exige un token válido de un usuario activo, salvo en rutas @Public(),
 * y aplica las restricciones de @Roles().
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @Inject(DB) private readonly db: Db,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const [tipo, token] = (req.headers.authorization ?? '').split(' ');
    if (tipo !== 'Bearer' || !token) throw new UnauthorizedException('Sesión requerida');

    let sub: string;
    try {
      ({ sub } = await this.jwt.verifyAsync<{ sub: string }>(token));
    } catch {
      throw new UnauthorizedException('Sesión inválida o vencida');
    }

    // Se consulta el usuario en cada petición para que desactivarlo o cambiarle el rol aplique de inmediato.
    const [usuario] = await this.db.select().from(usuarios).where(eq(usuarios.id, sub));
    if (!usuario || !usuario.activo) throw new UnauthorizedException('Usuario inactivo');

    const sesion: SesionUsuario = { id: usuario.id, email: usuario.email, nombre: usuario.nombre, rol: usuario.rol };
    req.usuario = sesion;

    const roles = this.reflector.getAllAndOverride<Rol[] | undefined>(ROLES_KEY, targets);
    if (roles && !roles.includes(sesion.rol)) throw new ForbiddenException('No tienes permiso para esta acción');
    return true;
  }
}
