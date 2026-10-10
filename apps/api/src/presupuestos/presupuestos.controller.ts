import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { Roles, SesionUsuario, UsuarioActual } from '../auth/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TIPOS_INSUMO, TIPOS_MATRIZ } from '../db/schema';
import { ImportarService } from '../importar/importar.service';
import { PresupuestosService } from './presupuestos.service';

const EDITAN = ['admin', 'presupuestador'] as const;
const LIMITE_ARCHIVO = 200 * 1024 * 1024;

const texto = (msg: string) => z.string().trim().min(1, msg);
const opcional = z.string().trim().nullish();
const decimal = (msg = 'Número inválido') =>
  z.union([z.string(), z.number()]).transform((v) => String(v).trim().replace(/,/g, '')).pipe(z.string().regex(/^-?\d+(\.\d+)?$/, msg));

const presupuestoSchema = z.object({ nombre: texto('Escribe el nombre'), cliente: opcional, ubicacion: opcional });
const partidaSchema = z.object({ tipo: z.literal('partida'), padreId: z.uuid().nullish(), clave: z.string().trim(), descripcion: texto('Escribe la descripción') });
const conceptoSchema = z.object({
  tipo: z.literal('concepto'),
  padreId: z.uuid().nullish(),
  cantidad: decimal('Cantidad inválida'),
  matrizId: z.uuid().optional(),
  clave: z.string().trim().optional(),
  descripcion: z.string().trim().optional(),
  nueva: z.object({ clave: texto('Escribe la clave'), descripcion: texto('Escribe la descripción'), unidad: z.string().trim() }).optional(),
});
const renglonSchema = z.discriminatedUnion('tipo', [partidaSchema, conceptoSchema]);
const cambioRenglonSchema = z.object({
  clave: z.string().trim().optional(),
  descripcion: z.string().trim().optional(),
  unidad: z.string().trim().optional(),
  cantidad: decimal('Cantidad inválida').optional(),
  matrizId: z.uuid().optional(),
});

const insumoSchema = z.object({
  clave: texto('Escribe la clave'),
  descripcion: z.string().trim().default(''),
  unidad: z.string().trim().default(''),
  tipo: z.enum(TIPOS_INSUMO),
  costo: decimal('Costo inválido').default('0'),
  moneda: z.string().trim().toUpperCase().default('MXN'),
  porcentajeManoObra: z.boolean().default(false),
  salarioBase: decimal('Salario inválido').nullable().default(null),
  fsr: decimal('FSR inválido').nullable().default(null),
});
const cambioInsumoSchema = insumoSchema.omit({ clave: true }).partial();

const matrizSchema = z.object({ clave: texto('Escribe la clave'), descripcion: z.string().trim().default(''), unidad: z.string().trim().default(''), tipo: z.enum(TIPOS_MATRIZ).default('concepto') });
const cambioMatrizSchema = matrizSchema.partial();
const renglonesMatrizSchema = z.object({
  renglones: z.array(z.object({ componente: texto('Falta la clave del componente'), cantidad: decimal('Cantidad inválida') })),
});

type Validado<T extends z.ZodType> = z.infer<T>;
const v = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s as z.ZodType<z.infer<T>>);
const uuid = new ParseUUIDPipe();

@Controller('presupuestos')
export class PresupuestosController {
  constructor(
    private readonly servicio: PresupuestosService,
    private readonly importar: ImportarService,
  ) {}

  @Get()
  listar() {
    return this.servicio.listar();
  }

  @Post()
  @Roles(...EDITAN)
  crear(@Body(v(presupuestoSchema)) datos: Validado<typeof presupuestoSchema>, @UsuarioActual() u: SesionUsuario) {
    return this.servicio.crear({ nombre: datos.nombre, cliente: datos.cliente ?? undefined, ubicacion: datos.ubicacion ?? undefined }, u.id);
  }

  @Post('importar/neodata')
  @Roles(...EDITAN)
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: LIMITE_ARCHIVO } }))
  importarNeodata(@UploadedFile() archivo: Express.Multer.File | undefined, @Body('nombre') nombre: string | undefined, @UsuarioActual() u: SesionUsuario) {
    if (!archivo) throw new BadRequestException('Adjunta el archivo de intercambio de Neodata');
    return this.importar.neodata(new Uint8Array(archivo.buffer), u.id, nombre);
  }

  @Get(':id')
  detalle(@Param('id', uuid) id: string) {
    return this.servicio.detalle(id);
  }

  @Patch(':id')
  @Roles(...EDITAN)
  actualizar(@Param('id', uuid) id: string, @Body(v(presupuestoSchema.partial())) cambios: Partial<Validado<typeof presupuestoSchema>>) {
    return this.servicio.actualizar(id, cambios);
  }

  @Delete(':id')
  @Roles(...EDITAN)
  @HttpCode(204)
  eliminar(@Param('id', uuid) id: string) {
    return this.servicio.eliminar(id);
  }

  // Árbol

  @Post(':id/renglones')
  @Roles(...EDITAN)
  agregarRenglon(@Param('id', uuid) id: string, @Body(v(renglonSchema)) datos: Validado<typeof renglonSchema>) {
    return datos.tipo === 'partida' ? this.servicio.agregarPartida(id, datos) : this.servicio.agregarConcepto(id, datos);
  }

  @Patch(':id/renglones/:rid')
  @Roles(...EDITAN)
  actualizarRenglon(@Param('id', uuid) id: string, @Param('rid', uuid) rid: string, @Body(v(cambioRenglonSchema)) cambios: Validado<typeof cambioRenglonSchema>) {
    return this.servicio.actualizarRenglon(id, rid, cambios);
  }

  @Delete(':id/renglones/:rid')
  @Roles(...EDITAN)
  @HttpCode(204)
  eliminarRenglon(@Param('id', uuid) id: string, @Param('rid', uuid) rid: string) {
    return this.servicio.eliminarRenglon(id, rid);
  }

  // Insumos

  @Get(':id/insumos')
  insumos(@Param('id', uuid) id: string) {
    return this.servicio.insumos(id);
  }

  @Post(':id/insumos')
  @Roles(...EDITAN)
  crearInsumo(@Param('id', uuid) id: string, @Body(v(insumoSchema)) datos: Validado<typeof insumoSchema>) {
    return this.servicio.crearInsumo(id, datos);
  }

  @Patch(':id/insumos/:iid')
  @Roles(...EDITAN)
  actualizarInsumo(@Param('id', uuid) id: string, @Param('iid', uuid) iid: string, @Body(v(cambioInsumoSchema)) cambios: Validado<typeof cambioInsumoSchema>) {
    return this.servicio.actualizarInsumo(id, iid, cambios);
  }

  @Delete(':id/insumos/:iid')
  @Roles(...EDITAN)
  @HttpCode(204)
  eliminarInsumo(@Param('id', uuid) id: string, @Param('iid', uuid) iid: string) {
    return this.servicio.eliminarInsumo(id, iid);
  }

  // Matrices (análisis de precio unitario)

  @Get(':id/matrices')
  matrices(@Param('id', uuid) id: string) {
    return this.servicio.matrices(id);
  }

  @Post(':id/matrices')
  @Roles(...EDITAN)
  crearMatriz(@Param('id', uuid) id: string, @Body(v(matrizSchema)) datos: Validado<typeof matrizSchema>) {
    return this.servicio.crearMatriz(id, datos);
  }

  @Get(':id/matrices/:mid')
  matriz(@Param('id', uuid) id: string, @Param('mid', uuid) mid: string) {
    return this.servicio.matriz(id, mid);
  }

  @Patch(':id/matrices/:mid')
  @Roles(...EDITAN)
  actualizarMatriz(@Param('id', uuid) id: string, @Param('mid', uuid) mid: string, @Body(v(cambioMatrizSchema)) cambios: Validado<typeof cambioMatrizSchema>) {
    return this.servicio.actualizarMatriz(id, mid, cambios);
  }

  @Put(':id/matrices/:mid/renglones')
  @Roles(...EDITAN)
  guardarRenglones(@Param('id', uuid) id: string, @Param('mid', uuid) mid: string, @Body(v(renglonesMatrizSchema)) datos: Validado<typeof renglonesMatrizSchema>) {
    return this.servicio.guardarRenglonesMatriz(id, mid, datos.renglones);
  }

  @Delete(':id/matrices/:mid')
  @Roles(...EDITAN)
  @HttpCode(204)
  eliminarMatriz(@Param('id', uuid) id: string, @Param('mid', uuid) mid: string) {
    return this.servicio.eliminarMatriz(id, mid);
  }
}
