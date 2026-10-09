import { dec, Numero } from './decimal';
import { Montos, MontosTexto } from './montos';
import { Catalogo, Insumo, Matriz, OpcionesCalculo, TipoMatriz } from './tipos';

export interface RenglonCalculado {
  componente: string;
  tipo: TipoMatriz;
  cantidad: string;
  /** Costo unitario del componente (para % de mano de obra, la base de mano de obra de la matriz). */
  costo: MontosTexto;
  importe: MontosTexto;
}

export interface MatrizCalculada {
  clave: string;
  tipo: TipoMatriz;
  costoDirecto: MontosTexto;
  /** Suma de importes por tipo de componente (material, mano de obra, auxiliar…). */
  porTipo: Readonly<Partial<Record<TipoMatriz, MontosTexto>>>;
  renglones: RenglonCalculado[];
}

export class ErrorDeCatalogo extends Error {}

/** Costo de una categoría de mano de obra: salario base × FSR, redondeado. */
export function costoManoDeObra(salarioBase: Numero, fsr: Numero, decimales = 2): string {
  return dec(salarioBase).times(dec(fsr)).toDecimalPlaces(decimales).toFixed(decimales);
}

/**
 * Calcula todas las matrices de un catálogo con la regla que reproduce a Neodata y Opus al centavo:
 *
 * 1. Importe de cada renglón = cantidad × costo del componente, redondeado a 2 decimales.
 * 2. Si el componente es otra matriz (auxiliar o cuadrilla), su costo se calcula primero con esta misma regla.
 * 3. Si el componente es un insumo de % de mano de obra, su costo es la suma de los importes de mano de obra
 *    (insumos y cuadrillas) de esa misma matriz.
 * 4. Costo directo de la matriz = suma de los importes.
 */
export class MotorApu {
  private readonly decimales: number;
  private readonly monedaBase: string;
  private readonly insumos = new Map<string, Insumo>();
  private readonly matrices = new Map<string, Matriz>();
  private readonly cache = new Map<string, { costo: Montos; detalle: MatrizCalculada }>();

  constructor(catalogo: Catalogo, opciones: OpcionesCalculo = {}) {
    this.decimales = opciones.decimales ?? 2;
    this.monedaBase = catalogo.monedaBase ?? 'MXN';
    for (const i of catalogo.insumos) {
      if (this.insumos.has(i.clave)) throw new ErrorDeCatalogo(`Insumo repetido: ${i.clave}`);
      this.insumos.set(i.clave, i);
    }
    for (const m of catalogo.matrices) {
      if (this.matrices.has(m.clave) || this.insumos.has(m.clave)) throw new ErrorDeCatalogo(`Clave repetida: ${m.clave}`);
      this.matrices.set(m.clave, m);
    }
  }

  /** Costo unitario de un insumo o matriz. */
  costo(clave: string): Montos {
    if (this.matrices.has(clave)) return this.calcular(clave, []).costo;
    const insumo = this.insumos.get(clave);
    if (!insumo) throw new ErrorDeCatalogo(`No existe el insumo o matriz ${clave}`);
    if (insumo.porcentajeDeManoDeObra) {
      throw new ErrorDeCatalogo(`${clave} es un porcentaje de mano de obra y solo tiene costo dentro de una matriz`);
    }
    return this.costoInsumo(insumo);
  }

  matriz(clave: string): MatrizCalculada {
    if (!this.matrices.has(clave)) throw new ErrorDeCatalogo(`No existe la matriz ${clave}`);
    return this.calcular(clave, []).detalle;
  }

  todas(): MatrizCalculada[] {
    return [...this.matrices.keys()].map((c) => this.matriz(c));
  }

  private costoInsumo(insumo: Insumo): Montos {
    if (insumo.tipo === 'mano_obra' && insumo.salarioBase !== undefined && insumo.fsr !== undefined) {
      return Montos.de(this.monedaBase, costoManoDeObra(insumo.salarioBase, insumo.fsr, this.decimales));
    }
    return Montos.desde(insumo.costo ?? {});
  }

  private calcular(clave: string, ruta: string[]): { costo: Montos; detalle: MatrizCalculada } {
    const hecho = this.cache.get(clave);
    if (hecho) return hecho;
    if (ruta.includes(clave)) throw new ErrorDeCatalogo(`Referencia circular: ${[...ruta, clave].join(' → ')}`);

    const matriz = this.matrices.get(clave)!;
    const d = this.decimales;
    const renglones: { componente: string; tipo: TipoMatriz; cantidad: string; costo: Montos; importe: Montos }[] = [];
    const pendientesPorcentaje: number[] = [];

    for (const r of matriz.renglones) {
      const sub = this.matrices.get(r.componente);
      const insumo = this.insumos.get(r.componente);
      if (!sub && !insumo) throw new ErrorDeCatalogo(`La matriz ${clave} usa ${r.componente}, que no existe`);
      const tipo = sub ? sub.tipo : insumo!.tipo;
      const cantidad = dec(r.cantidad).toString();
      if (insumo?.porcentajeDeManoDeObra) {
        pendientesPorcentaje.push(renglones.length);
        renglones.push({ componente: r.componente, tipo, cantidad, costo: Montos.vacio, importe: Montos.vacio });
        continue;
      }
      const costo = sub ? this.calcular(r.componente, [...ruta, clave]).costo : this.costoInsumo(insumo!);
      renglones.push({ componente: r.componente, tipo, cantidad, costo, importe: costo.por(cantidad, d) });
    }

    if (pendientesPorcentaje.length) {
      const manoDeObra = renglones.filter((r) => r.tipo === 'mano_obra').reduce((s, r) => s.sumar(r.importe), Montos.vacio);
      for (const i of pendientesPorcentaje) {
        renglones[i] = { ...renglones[i], costo: manoDeObra, importe: manoDeObra.por(renglones[i].cantidad, d) };
      }
    }

    let total = Montos.vacio;
    const porTipo = new Map<TipoMatriz, Montos>();
    for (const r of renglones) {
      total = total.sumar(r.importe);
      porTipo.set(r.tipo, (porTipo.get(r.tipo) ?? Montos.vacio).sumar(r.importe));
    }

    const resultado = {
      costo: total,
      detalle: {
        clave,
        tipo: matriz.tipo,
        costoDirecto: total.aTexto(d),
        porTipo: Object.fromEntries([...porTipo].map(([t, m]) => [t, m.aTexto(d)])),
        renglones: renglones.map((r) => ({ ...r, costo: r.costo.aTexto(d), importe: r.importe.aTexto(d) })),
      },
    };
    this.cache.set(clave, resultado);
    return resultado;
  }
}

/** Atajo para calcular el costo directo de una sola matriz. */
export function calcularMatriz(catalogo: Catalogo, clave: string, opciones?: OpcionesCalculo): MatrizCalculada {
  return new MotorApu(catalogo, opciones).matriz(clave);
}

