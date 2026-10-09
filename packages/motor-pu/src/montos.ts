import { CERO, Decimal, dec, Numero } from './decimal';

/** Clave de moneda, por ejemplo "MXN" o "USD". */
export type Moneda = string;

/** Importes por moneda, como cadenas exactas (lo que devuelve el motor). */
export type MontosTexto = Readonly<Record<Moneda, string>>;

/**
 * Importe que puede estar en varias monedas a la vez, como en Opus, donde un concepto
 * puede llevar una parte en pesos y otra en dólares. Es inmutable.
 */
export class Montos {
  private constructor(private readonly valores: ReadonlyMap<Moneda, Decimal>) {}

  static readonly vacio = new Montos(new Map());

  static de(moneda: Moneda, valor: Numero): Montos {
    return Montos.desde({ [moneda]: valor });
  }

  static desde(valores: Readonly<Record<Moneda, Numero>>): Montos {
    const m = new Map<Moneda, Decimal>();
    for (const [moneda, v] of Object.entries(valores)) {
      const d = dec(v);
      if (!d.isZero()) m.set(moneda, d);
    }
    return new Montos(m);
  }

  get monedas(): Moneda[] {
    return [...this.valores.keys()];
  }

  en(moneda: Moneda): Decimal {
    return this.valores.get(moneda) ?? CERO;
  }

  get esCero(): boolean {
    return this.valores.size === 0;
  }

  sumar(otro: Montos): Montos {
    const m = new Map(this.valores);
    for (const [moneda, v] of otro.valores) m.set(moneda, (m.get(moneda) ?? CERO).plus(v));
    return Montos.limpio(m);
  }

  /** Multiplica cada moneda por `factor` y redondea a `decimales`. */
  por(factor: Numero, decimales: number): Montos {
    const f = dec(factor);
    const m = new Map<Moneda, Decimal>();
    for (const [moneda, v] of this.valores) m.set(moneda, v.times(f).toDecimalPlaces(decimales));
    return Montos.limpio(m);
  }

  /** Total convertido a una moneda base con los tipos de cambio dados (la moneda base vale 1). */
  convertir(tiposDeCambio: Readonly<Record<Moneda, Numero>>, decimales: number): Decimal {
    let total = CERO;
    for (const [moneda, v] of this.valores) {
      const tc = tiposDeCambio[moneda];
      if (tc === undefined) throw new Error(`Falta el tipo de cambio de ${moneda}`);
      total = total.plus(v.times(dec(tc)).toDecimalPlaces(decimales));
    }
    return total;
  }

  aTexto(decimales = 2): MontosTexto {
    return Object.fromEntries([...this.valores].sort(([a], [b]) => a.localeCompare(b)).map(([moneda, v]) => [moneda, v.toFixed(decimales)]));
  }

  private static limpio(m: Map<Moneda, Decimal>): Montos {
    for (const [moneda, v] of m) if (v.isZero()) m.delete(moneda);
    return new Montos(m);
  }
}
