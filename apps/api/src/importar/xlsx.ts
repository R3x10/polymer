import { strFromU8, unzipSync } from 'fflate';
import { SaxesParser } from 'saxes';

export type Celda = string | number | boolean | null;

export class ErrorDeArchivo extends Error {}

/**
 * Lector mínimo de .xlsx: devuelve las filas de las hojas pedidas como arreglos de valores.
 * Se escribió a mano porque los archivos de Neodata (generados con SpreadsheetGear) omiten la
 * referencia de celda y las bibliotecas comunes fallan con ellos.
 */
export function leerXlsx(contenido: Uint8Array, hojas: readonly string[]): Map<string, Celda[][]> {
  let archivos: Record<string, Uint8Array>;
  try {
    archivos = unzipSync(contenido);
  } catch {
    throw new ErrorDeArchivo('El archivo no es un Excel (.xlsx) válido');
  }
  // Se acepta también un .zip con un solo .xlsx adentro, que es como Neodata exporta.
  const internos = Object.keys(archivos).filter((n) => n.toLowerCase().endsWith('.xlsx'));
  if (!archivos['xl/workbook.xml'] && internos.length === 1) return leerXlsx(archivos[internos[0]], hojas);
  if (!archivos['xl/workbook.xml']) throw new ErrorDeArchivo('El archivo no contiene un libro de Excel');

  const texto = (ruta: string) => (archivos[ruta] ? strFromU8(archivos[ruta]) : undefined);
  const compartidas = leerCadenasCompartidas(texto('xl/sharedStrings.xml'));

  const rutas = new Map<string, string>();
  parsear(texto('xl/_rels/workbook.xml.rels')!, (nombre, a) => {
    if (nombre === 'Relationship') rutas.set(a.Id, 'xl/' + a.Target.replace(/^\/?xl\//, ''));
  });
  const porNombre = new Map<string, string>();
  parsear(texto('xl/workbook.xml')!, (nombre, a) => {
    if (nombre === 'sheet') porNombre.set(a.name, rutas.get(a['r:id'])!);
  });

  const resultado = new Map<string, Celda[][]>();
  for (const hoja of hojas) {
    const ruta = porNombre.get(hoja);
    const xml = ruta && texto(ruta);
    if (!xml) throw new ErrorDeArchivo(`Falta la hoja "${hoja}"`);
    resultado.set(hoja, leerHoja(xml, compartidas));
  }
  return resultado;
}

function parsear(xml: string, abrir: (nombre: string, atributos: Record<string, string>) => void, extra?: (p: SaxesParser) => void) {
  const p = new SaxesParser();
  p.on('opentag', (t) => abrir(t.name, t.attributes as Record<string, string>));
  extra?.(p);
  p.write(xml.replace(/^﻿/, '')).close();
}

function leerCadenasCompartidas(xml: string | undefined): string[] {
  if (!xml) return [];
  const lista: string[] = [];
  let actual: string | null = null;
  let enTexto = false;
  let enFonetica = false;
  parsear(
    xml,
    (n) => {
      if (n === 'si') actual = '';
      else if (n === 'rPh') enFonetica = true;
      else if (n === 't' && !enFonetica) enTexto = true;
    },
    (p) => {
      p.on('text', (t) => {
        if (enTexto && actual !== null) actual += t;
      });
      p.on('closetag', (t) => {
        if (t.name === 't') enTexto = false;
        else if (t.name === 'rPh') enFonetica = false;
        else if (t.name === 'si') {
          lista.push(actual ?? '');
          actual = null;
        }
      });
    },
  );
  return lista;
}

/** Convierte "AB12" en el índice de columna 27. */
function columna(ref: string): number {
  let n = 0;
  for (const ch of ref) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

function leerHoja(xml: string, compartidas: string[]): Celda[][] {
  const filas: Celda[][] = [];
  let fila: Celda[] | null = null;
  let col = 0;
  let tipo = '';
  let valor = '';
  let enValor = false;
  parsear(
    xml,
    (n, a) => {
      if (n === 'row') {
        const r = a.r ? Number(a.r) - 1 : filas.length;
        while (filas.length < r) filas.push([]);
        fila = [];
        col = 0;
      } else if (n === 'c') {
        if (a.r) col = columna(a.r);
        tipo = a.t ?? 'n';
        valor = '';
      } else if (n === 'v' || n === 't') {
        enValor = true;
      }
    },
    (p) => {
      p.on('text', (t) => {
        if (enValor) valor += t;
      });
      p.on('closetag', (t) => {
        if (t.name === 'v' || t.name === 't') enValor = false;
        else if (t.name === 'c' && fila) {
          fila[col] = convertir(tipo, valor, compartidas);
          col++;
        } else if (t.name === 'row' && fila) {
          filas.push(Array.from(fila, (v) => v ?? null));
          fila = null;
        }
      });
    },
  );
  return filas;
}

function convertir(tipo: string, valor: string, compartidas: string[]): Celda {
  if (valor === '') return null;
  switch (tipo) {
    case 's':
      return compartidas[Number(valor)] ?? null;
    case 'b':
      return valor === '1';
    case 'str':
    case 'inlineStr':
    case 'e':
      return valor;
    default:
      return Number(valor);
  }
}
