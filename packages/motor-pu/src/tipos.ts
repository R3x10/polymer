import { Numero } from './decimal';
import { Moneda } from './montos';

/** Clasificación de un insumo. Una matriz de tipo `mano_obra` es una cuadrilla. */
export type TipoInsumo = 'material' | 'mano_obra' | 'herramienta' | 'equipo' | 'subcontrato' | 'flete' | 'otro';

/** Una matriz es un análisis de precio: concepto de obra, auxiliar (básico) o insumo compuesto como una cuadrilla. */
export type TipoMatriz = 'concepto' | 'auxiliar' | TipoInsumo;

export interface Insumo {
  clave: string;
  tipo: TipoInsumo;
  unidad?: string;
  /** Costo por moneda; si falta moneda se usa la moneda base del catálogo. */
  costo?: Readonly<Record<Moneda, Numero>>;
  /**
   * Si es verdadero, el insumo no tiene costo propio: en cada matriz vale la suma de la mano de obra
   * de esa matriz, y la cantidad del renglón es el porcentaje (0.03 = 3 %). Así se calculan la
   * herramienta menor y el equipo de seguridad en Neodata y Opus.
   */
  porcentajeDeManoDeObra?: boolean;
  /** Para mano de obra: salario base y factor de salario real. Si vienen, el costo es salario × FSR. */
  salarioBase?: Numero;
  fsr?: Numero;
}

export interface RenglonMatriz {
  /** Clave de un insumo o de otra matriz (auxiliar, cuadrilla). */
  componente: string;
  cantidad: Numero;
}

export interface Matriz {
  clave: string;
  tipo: TipoMatriz;
  unidad?: string;
  renglones: readonly RenglonMatriz[];
}

export interface Catalogo {
  /** Moneda de los costos que no la indican. Por omisión "MXN". */
  monedaBase?: Moneda;
  insumos: readonly Insumo[];
  matrices: readonly Matriz[];
}

export interface OpcionesCalculo {
  /** Decimales a los que se redondea cada importe. Neodata y Opus usan 2. */
  decimales?: number;
}
