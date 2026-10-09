import { Inject, Injectable, Logger, OnApplicationBootstrap, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ENV, Env } from '../config/env';
import { aPublico, UsersService, UsuarioPublico } from '../users/users.service';
import { hashPassword, verifyPassword } from './passwords';

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AuthService.name);
  private hashFicticio?: Promise<string>;

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** La primera vez que arranca el sistema crea el administrador con los datos del entorno. */
  async onApplicationBootstrap() {
    if ((await this.users.contar()) > 0) return;
    const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = this.env;
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      this.logger.warn('No hay usuarios. Define ADMIN_EMAIL y ADMIN_PASSWORD para crear el administrador.');
      return;
    }
    await this.users.crear({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, nombre: ADMIN_NAME, rol: 'admin' });
    this.logger.log(`Administrador inicial creado: ${ADMIN_EMAIL}`);
  }

  async login(email: string, password: string): Promise<{ token: string; usuario: UsuarioPublico }> {
    const u = await this.users.buscarPorEmail(email);
    // Se verifica la contraseña aun si el usuario no existe para no revelar qué correos están registrados.
    this.hashFicticio ??= hashPassword('contrasena-ficticia');
    const ok = await verifyPassword(password, u?.passwordHash ?? (await this.hashFicticio));
    if (!u || !ok || !u.activo) throw new UnauthorizedException('Correo o contraseña incorrectos');
    const token = await this.jwt.signAsync({ sub: u.id, rol: u.rol });
    return { token, usuario: aPublico(u) };
  }
}
