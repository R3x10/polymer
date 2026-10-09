import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Rol } from '../db/schema';

export const IS_PUBLIC = 'isPublic';
export const ROLES_KEY = 'roles';

/** Permite el acceso sin sesión. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Restringe el acceso a los roles indicados. */
export const Roles = (...roles: Rol[]) => SetMetadata(ROLES_KEY, roles);

export interface SesionUsuario {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
}

export const UsuarioActual = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): SesionUsuario => ctx.switchToHttp().getRequest().usuario,
);
