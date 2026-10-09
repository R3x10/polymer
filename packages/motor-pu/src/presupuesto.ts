import { dec, Numero } from './decimal';
import { Montos, MontosTexto } from './montos';
import { MotorApu } from './apu';

/** Renglón de presupuesto: una partida (agrupador) o un concepto con cantidad. */
export type RenglonPresupuesto =
  | { id: string; padre?: string; tipo: 'partida'; clave?: string }
  | { id: string; padre?: string; tipo: 'concepto'; clave?: string; matriz: string; cantidad: Numero };

export interface RenglonPresupuestoCalculado {
  id: string;
  tipo: 'partida' | 'concepto';
  /** Precio unitario del concepto (por ahora igual al costo directo; los sobrecostos vienen después). */
  precioUnitario?: MontosTexto;
  importe: MontosTexto;
}

export interface PresupuestoCalculado {
  renglones: Map<string, RenglonPresupuestoCalculado>;
  total: MontosTexto;
}

/**
 * Importe de cada concepto = cantidad × precio unitario, redondeado a 2 decimales.
 * Importe de cada partida = suma de los importes de sus hijos.
 */
export function calcularPresupuesto(
  motor: MotorApu,
  renglones: readonly RenglonPresupuesto[],
  opciones: { decimales?: number } = {},
): PresupuestoCalculado {
  const d = opciones.decimales ?? 2;
  const porId = new Map(renglones.map((r) => [r.id, r]));
  const hijos = new Map<string | undefined, RenglonPresupuesto[]>();
  for (const r of renglones) {
    if (r.padre !== undefined && !porId.has(r.padre)) throw new Error(`El renglón ${r.id} apunta a un padre inexistente: ${r.padre}`);
    const lista = hijos.get(r.padre) ?? [];
    lista.push(r);
    hijos.set(r.padre, lista);
  }

  const resultado = new Map<string, RenglonPresupuestoCalculado>();
  const calcular = (r: RenglonPresupuesto, ruta: Set<string>): Montos => {
    if (ruta.has(r.id)) throw new Error(`Ciclo en el árbol del presupuesto en ${r.id}`);
    if (r.tipo === 'concepto') {
      const pu = motor.costo(r.matriz);
      const importe = pu.por(dec(r.cantidad), d);
      resultado.set(r.id, { id: r.id, tipo: r.tipo, precioUnitario: pu.aTexto(d), importe: importe.aTexto(d) });
      return importe;
    }
    const sub = new Set(ruta).add(r.id);
    const importe = (hijos.get(r.id) ?? []).reduce((s, h) => s.sumar(calcular(h, sub)), Montos.vacio);
    resultado.set(r.id, { id: r.id, tipo: r.tipo, importe: importe.aTexto(d) });
    return importe;
  };

  const total = (hijos.get(undefined) ?? []).reduce((s, r) => s.sumar(calcular(r, new Set())), Montos.vacio);
  return { renglones: resultado, total: total.aTexto(d) };
}
