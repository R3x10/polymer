import { CERO, Decimal, dec } from './decimal';

/**
 * Renglón de cuantificación (generador) de un concepto: un tramo medido en obra.
 * Si trae fórmula se evalúa; si no, el resultado es el producto de las medidas capturadas.
 */
export interface RenglonCuantificacion {
  piezas?: string | null;
  largo?: string | null;
  ancho?: string | null;
  alto?: string | null;
  /** Expresión aritmética: números, + - * / ( ) y las variables P (piezas), L (largo), A (ancho), H (alto). */
  formula?: string | null;
}

export class ErrorDeFormula extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorDeFormula';
  }
}

const vacio = (v: string | null | undefined): v is null | undefined | '' => v === null || v === undefined || v.trim() === '';

function numero(v: string, campo: string): Decimal {
  try {
    return dec(v.trim());
  } catch {
    throw new ErrorDeFormula(`${campo} no es un número: ${v}`);
  }
}

/**
 * Evalúa una expresión aritmética sin usar `eval`: números, + - * / ( ), signos y variables.
 * Precedencia normal; la división entre cero es error.
 */
export function evaluarExpresion(texto: string, variables: Record<string, Decimal> = {}): Decimal {
  const fichas = texto.match(/\d+(?:\.\d*)?|\.\d+|[A-Za-z_]\w*|[-+*/()]|\S/g) ?? [];
  let i = 0;
  const ver = () => fichas[i];
  const tomar = () => fichas[i++];

  const suma = (): Decimal => {
    let v = producto();
    while (ver() === '+' || ver() === '-') v = tomar() === '+' ? v.plus(producto()) : v.minus(producto());
    return v;
  };
  const producto = (): Decimal => {
    let v = unario();
    while (ver() === '*' || ver() === '/') {
      if (tomar() === '*') v = v.times(unario());
      else {
        const d = unario();
        if (d.isZero()) throw new ErrorDeFormula('División entre cero');
        v = v.div(d);
      }
    }
    return v;
  };
  const unario = (): Decimal => {
    if (ver() === '-') return (tomar(), unario().neg());
    if (ver() === '+') return (tomar(), unario());
    return primario();
  };
  const primario = (): Decimal => {
    const f = tomar();
    if (f === undefined) throw new ErrorDeFormula('La fórmula está incompleta');
    if (f === '(') {
      const v = suma();
      if (tomar() !== ')') throw new ErrorDeFormula('Falta cerrar un paréntesis');
      return v;
    }
    if (/^[\d.]/.test(f)) return dec(f);
    if (/^[A-Za-z_]/.test(f)) {
      const v = variables[f.toUpperCase()];
      if (v === undefined) throw new ErrorDeFormula(`Variable desconocida: ${f}`);
      return v;
    }
    throw new ErrorDeFormula(`Símbolo no válido: ${f}`);
  };

  if (fichas.length === 0) throw new ErrorDeFormula('La fórmula está vacía');
  const v = suma();
  if (i < fichas.length) throw new ErrorDeFormula(`Sobra "${fichas[i]}" en la fórmula`);
  return v;
}

/** Resultado de un renglón de cuantificación, sin redondear. */
export function resultadoCuantificacion(r: RenglonCuantificacion): Decimal {
  const medidas = { P: r.piezas, L: r.largo, A: r.ancho, H: r.alto };
  const nombres = { P: 'Piezas', L: 'Largo', A: 'Ancho', H: 'Alto' } as const;
  const valores: Record<string, Decimal> = {};
  for (const [k, v] of Object.entries(medidas)) if (!vacio(v)) valores[k] = numero(v, nombres[k as keyof typeof nombres]);

  if (!vacio(r.formula)) {
    // Una medida no capturada vale 1 en la fórmula, igual que en el producto.
    return evaluarExpresion(r.formula, { P: dec(1), L: dec(1), A: dec(1), H: dec(1), ...valores });
  }
  const capturadas = Object.values(valores);
  return capturadas.length ? capturadas.reduce((a, b) => a.times(b)) : CERO;
}

/**
 * Cantidad total de un concepto a partir de su cuantificación: suma de los renglones
 * (los negativos descuentan), redondeada a `decimales` (6 por omisión, la precisión con que se guarda).
 */
export function calcularCuantificacion(renglones: readonly RenglonCuantificacion[], decimales = 6) {
  const resultados = renglones.map((r) => resultadoCuantificacion(r).toDecimalPlaces(decimales));
  const total = resultados.reduce((a, b) => a.plus(b), CERO);
  return { resultados: resultados.map((r) => r.toFixed(decimales)), total: total.toFixed(decimales) };
}
