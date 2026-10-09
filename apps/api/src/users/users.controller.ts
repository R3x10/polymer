import { Body, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { ROLES } from '../db/schema';
import { Roles, SesionUsuario, UsuarioActual } from '../auth/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { UsersService } from './users.service';

const crearSchema = z.object({
  email: z.email('Correo inválido').trim(),
  nombre: z.string().trim().min(1, 'El nombre es obligatorio'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  rol: z.enum(ROLES),
});

const actualizarSchema = crearSchema.partial().extend({ activo: z.boolean().optional() });

@Controller('usuarios')
@Roles('admin')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  listar() {
    return this.users.listar();
  }

  @Post()
  crear(@Body(new ZodValidationPipe(crearSchema)) datos: z.infer<typeof crearSchema>) {
    return this.users.crear(datos);
  }

  @Patch(':id')
  actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(actualizarSchema)) cambios: z.infer<typeof actualizarSchema>,
    @UsuarioActual() actual: SesionUsuario,
  ) {
    // Evita que el administrador se quede fuera del sistema por accidente.
    if (id === actual.id && (cambios.activo === false || (cambios.rol && cambios.rol !== 'admin'))) {
      throw new ForbiddenException('No puedes desactivarte ni quitarte el rol de administrador');
    }
    return this.users.actualizar(id, cambios);
  }
}
