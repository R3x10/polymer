import { Decimal } from '@puselfhost/motor-pu';
import { TIPOS_INSUMO, TIPOS_MATRIZ } from '../db/schema';
import { Celda, ErrorDeArchivo, leerXlsx } from './xlsx';

type TipoInsumo = (typeof TIPOS_INSUMO)[number];
type TipoMatriz = (typeof TIPOS_MATRIZ)[number];

export interface InsumoImportado {
  clave: string;
  descripcion: string;
  unidad: string;
  tipo: TipoInsumo;
  costo: string;
  porcentajeManoObra: boolean;
}

export interface MatrizImportada {
  clave: string;
  descripcion: string;
  unidad: string;
  tipo: TipoMatriz;
  renglones: { componente: string; cantidad: string }[];
}

export interface RenglonImportado {
  ref: string;
  padreRef?: string;
  tipo: 'partida' | 'concepto';
  clave: string;
  descripcion: string;
  matriz?: string;
  cantidad?: string;
}

export interface PresupuestoImportado {
  nombre: string;
  cliente: string | null;
  ubicacion: string | null;
  insumos: InsumoImportado[];
  matrices: MatrizImportada[];
  renglones: RenglonImportado[];
  /** Total de costo directo que reporta Neodata, para comprobar el cálculo. */
  totalOrigen: string;
  advertencias: string[];
}

const HOJAS = ['N_Campos Generales', 'CatalogoGeneral', 'Presupuesto', 'Partidas', 'Matrices'] as const;

/** Tipo de Neodata: 1 material, 2 mano de obra, 3 herramienta y equipo, 4 concepto o auxiliar. */
const TIPO_NEODATA: Record<number, TipoInsumo | 'concepto'> = { 1: 'material', 2: 'mano_obra', 3: 'equipo', 4: 'concepto' };

const texto = (v: Celda | undefined) => (v === null || v === undefined ? '' : String(v).trim());
const numero = (v: Celda | undefined) => new Decimal(typeof v === 'number' ? v : Number(texto(v) || 0)).toFixed();

/** Lee la tabla de una hoja usando su primera fila como encabezados. */
function tabla(filas: Celda[][], hoja: string, columnas: readonly string[]) {
  const encabezados = (filas[0] ?? []).map(texto);
  const indice = Object.fromEntries(
    columnas.map((c) => {
      const i = encabezados.indexOf(c);
      if (i < 0) throw new ErrorDeArchivo(`A la hoja "${hoja}" le falta la columna "${c}"`);
      return [c, i];
    }),
  ) as Record<string, number>;
  return filas.slice(1).map((f) => (c: string) => f[indice[c]]);
}

/** Interpreta un archivo de intercambio de Neodata (Xn_Presupuesto.xlsx, o el .zip que lo contiene). */
export function interpretarNeodata(contenido: Uint8Array): PresupuestoImportado {
  const hojas = leerXlsx(contenido, HOJAS);
  const advertencias: string[] = [];

  const campos = new Map((hojas.get('N_Campos Generales') ?? []).map((f) => [texto(f[0]).toLowerCase(), texto(f[2])]));

  const catalogo = new Map<string, (c: string) => Celda>();
  for (const f of tabla(hojas.get('CatalogoGeneral')!, 'CatalogoGeneral', ['Codigo', 'Descripcion completa', 'Unidad', 'Tipo', '%', 'Tipo %', 'Costo0'])) {
    const clave = texto(f('Codigo'));
    if (clave) catalogo.set(clave, f);
  }

  const renglonesMatriz = new Map<string, { componente: string; cantidad: string; orden: number }[]>();
  for (const f of tabla(hojas.get('Matrices')!, 'Matrices', ['CodigoM', 'CodigoI', 'Renglon', '/', 'Cantidad'])) {
    const m = texto(f('CodigoM'));
    if (!m) continue;
    if (texto(f('/')) !== '*' && texto(f('/')) !== '') {
      advertencias.push(`La matriz ${m} usa el operador "${texto(f('/'))}", que todavía no se soporta; se tomó como multiplicación`);
    }
    const lista = renglonesMatriz.get(m) ?? [];
    lista.push({ componente: texto(f('CodigoI')), cantidad: numero(f('Cantidad')), orden: Number(f('Renglon')) || 0 });
    renglonesMatriz.set(m, lista);
  }

  const partidas = tabla(hojas.get('Partidas')!, 'Partidas', ['PadreWbs', 'PartidaWbs', 'Partida', 'Renglon', 'DescripcionPartida', 'DescripcionPartidaLarga', 'Costo0']);
  const conceptos = tabla(hojas.get('Presupuesto')!, 'Presupuesto', ['PartidaWBS', 'Codigo', 'Renglon', 'Cantidad']);

  const renglones: RenglonImportado[] = [];
  const wbsConocidos = new Set(partidas.map((p) => texto(p('PartidaWbs'))));
  let totalOrigen = new Decimal(0);
  const ordenadas = [...partidas].sort((a, b) => (Number(a('Renglon')) || 0) - (Number(b('Renglon')) || 0));
  for (const p of ordenadas) {
    const wbs = texto(p('PartidaWbs'));
    const padre = texto(p('PadreWbs'));
    if (!wbs) continue;
    if (!padre) totalOrigen = totalOrigen.plus(Number(p('Costo0')) || 0);
    renglones.push({
      ref: `P:${wbs}`,
      padreRef: padre && wbsConocidos.has(padre) ? `P:${padre}` : undefined,
      tipo: 'partida',
      clave: texto(p('Partida')),
      descripcion: texto(p('DescripcionPartidaLarga')) || texto(p('DescripcionPartida')),
    });
  }

  // Se importan solo los insumos y matrices que usa el presupuesto, no todo el banco de precios.
  const usados = new Set<string>();
  const visitar = (clave: string) => {
    if (usados.has(clave)) return;
    usados.add(clave);
    for (const r of renglonesMatriz.get(clave) ?? []) visitar(r.componente);
  };
  const ordenConceptos = [...conceptos].sort((a, b) => (Number(a('Renglon')) || 0) - (Number(b('Renglon')) || 0));
  for (const c of ordenConceptos) {
    const clave = texto(c('Codigo'));
    const wbs = texto(c('PartidaWBS'));
    if (!clave) continue;
    if (!catalogo.has(clave)) {
      advertencias.push(`El concepto ${clave} no está en el catálogo; se omitió`);
      continue;
    }
    visitar(clave);
    renglones.push({
      ref: `C:${wbs}:${clave}:${texto(c('Renglon'))}`,
      padreRef: wbsConocidos.has(wbs) ? `P:${wbs}` : undefined,
      tipo: 'concepto',
      clave,
      descripcion: '',
      matriz: clave,
      cantidad: numero(c('Cantidad')),
    });
  }

  const insumos: InsumoImportado[] = [];
  const matrices: MatrizImportada[] = [];
  for (const clave of [...usados].sort()) {
    const f = catalogo.get(clave);
    if (!f) {
      advertencias.push(`${clave} se usa en una matriz pero no está en el catálogo; se creó en cero`);
      insumos.push({ clave, descripcion: '', unidad: '', tipo: 'material', costo: '0', porcentajeManoObra: false });
      continue;
    }
    const tipo = TIPO_NEODATA[Number(f('Tipo'))];
    if (!tipo) advertencias.push(`${clave} tiene un tipo desconocido (${texto(f('Tipo'))}); se tomó como material`);
    const base = { clave, descripcion: texto(f('Descripcion completa')), unidad: texto(f('Unidad')) };
    if (renglonesMatriz.has(clave)) {
      const renglonesOrdenados = [...renglonesMatriz.get(clave)!].sort((a, b) => a.orden - b.orden);
      matrices.push({ ...base, tipo: tipo ?? 'concepto', renglones: renglonesOrdenados.map(({ componente, cantidad }) => ({ componente, cantidad })) });
    } else {
      const porcentajeManoObra = Number(f('%')) === 1 && Number(f('Tipo %')) === 2;
      insumos.push({
        ...base,
        tipo: tipo === 'concepto' || !tipo ? 'material' : tipo,
        costo: porcentajeManoObra ? '0' : numero(f('Costo0')),
        porcentajeManoObra,
      });
    }
  }

  return {
    nombre: campos.get('nombredelaobra') || campos.get('codigodelaobra') || 'Obra importada de Neodata',
    cliente: campos.get('nombrecliente') || null,
    ubicacion: [campos.get('ciudaddelaobra'), campos.get('estadodelaobra')].filter(Boolean).join(', ') || null,
    insumos,
    matrices,
    renglones,
    totalOrigen: totalOrigen.toFixed(2),
    advertencias,
  };
}
