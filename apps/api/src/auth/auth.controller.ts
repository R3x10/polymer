import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthService } from './auth.service';
import { Public, SesionUsuario, UsuarioActual } from './decorators';

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Escribe tu correo'),
  password: z.string().min(1, 'Escribe tu contraseña'),
});

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body(new ZodValidationPipe(loginSchema)) { email, password }: z.infer<typeof loginSchema>) {
    return this.auth.login(email, password);
  }

  @Get('yo')
  yo(@UsuarioActual() usuario: SesionUsuario) {
    return usuario;
  }
}
