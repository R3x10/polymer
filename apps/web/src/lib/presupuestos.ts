import { ApiError } from './api';

export type Montos = Record<string, string>;

export const TIPOS_INSUMO = {
  material: 'Material',
  mano_obra: 'Mano de obra',
  herramienta: 'Herramienta',
  equipo: 'Equipo',
  subcontrato: 'Subcontrato',
  flete: 'Flete',
  otro: 'Otro',
} as const;
export type TipoInsumo = keyof typeof TIPOS_INSUMO;

export const TIPOS_MATRIZ = { concepto: 'Concepto', auxiliar: 'Auxiliar', ...TIPOS_INSUMO } as const;
export type TipoMatriz = keyof typeof TIPOS_MATRIZ;

export interface PresupuestoResumen {
  id: string;
  nombre: string;
  cliente: string | null;
  origen: string | null;
  actualizadoEn: string;
  conceptos: number;
}

export interface RenglonArbol {
  id: string;
  padreId: string | null;
  tipo: 'partida' | 'concepto';
  clave: string;
  descripcion: string;
  unidad: string;
  matrizId: string | null;
  matrizClave: string | null;
  cantidad: string | null;
  precioUnitario?: Montos;
  importe: Montos;
}

export interface DetallePresupuesto {
  presupuesto: { id: string; nombre: string; cliente: string | null; ubicacion: string | null; origen: string | null; monedaBase: string };
  renglones: RenglonArbol[];
  total: Montos;
}

export interface Insumo {
  id: string;
  clave: string;
  descripcion: string;
  unidad: string;
  tipo: TipoInsumo;
  costo: string;
  moneda: string;
  porcentajeManoObra: boolean;
  salarioBase: string | null;
  fsr: string | null;
  costoCalculado: string | null;
}

export interface MatrizResumen {
  id: string;
  clave: string;
  descripcion: string;
  unidad: string;
  tipo: TipoMatriz;
  costoDirecto: Montos;
}

export interface RenglonApu {
  id: string;
  componente: string;
  esMatriz: boolean;
  componenteId: string;
  descripcion: string;
  unidad: string;
  tipo: TipoMatriz;
  porcentajeManoObra: boolean;
  cantidad: string;
  costo: Montos;
  importe: Montos;
}

export interface DetalleMatriz extends MatrizResumen {
  porTipo: Partial<Record<TipoMatriz, Montos>>;
  renglones: RenglonApu[];
}

const formato = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "$1,234.56" o "$1,234.56 + USD 10.00" si el importe lleva varias monedas. */
export function dinero(m: Montos | undefined, monedaBase = 'MXN'): string {
  if (!m) return '';
  const base = formato.format(Number(m[monedaBase] ?? 0));
  const otras = Object.entries(m)
    .filter(([moneda]) => moneda !== monedaBase)
    .map(([moneda, v]) => `${moneda} ${formato.format(Number(v))}`);
  return ['$' + base, ...otras].join(' + ');
}

/** Quita los ceros sobrantes que trae NUMERIC ("120.500000" → "120.5"). */
export const cantidadTexto = (v: string | null) => (v === null ? '' : v.includes('.') ? v.replace(/0+$/, '').replace(/\.$/, '') : v);

export const mensajeError = (e: unknown) =>
  e instanceof ApiError ? (e.errores.length ? e.errores.map((x) => x.mensaje).join('. ') : e.message) : 'No se pudo conectar con el servidor';

/** Color de etiqueta por tipo, para distinguir de un vistazo material, mano de obra, etc. */
export const COLOR_TIPO: Record<TipoMatriz, 'gris' | 'azul' | 'verde' | 'amarillo' | 'naranja' | 'rojo' | 'morado' | 'rosa'> = {
  material: 'azul',
  mano_obra: 'naranja',
  herramienta: 'amarillo',
  equipo: 'morado',
  subcontrato: 'rosa',
  flete: 'verde',
  otro: 'gris',
  concepto: 'gris',
  auxiliar: 'verde',
};
