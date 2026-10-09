import DecimalBase from 'decimal.js';

/**
 * Decimal con precisión de sobra y redondeo "mitad hacia arriba" (0.005 → 0.01),
 * que es como redondean Neodata y Opus. Nunca se usa `number` para dinero.
 */
export const Decimal = DecimalBase.clone({ precision: 40, rounding: DecimalBase.ROUND_HALF_UP });
export type Decimal = InstanceType<typeof Decimal>;

/** Valor numérico de entrada: cadena ("0.03"), número o Decimal. Para dinero, preferir cadenas. */
export type Numero = string | number | Decimal;

export const dec = (n: Numero): Decimal => new Decimal(n);

export const CERO = new Decimal(0);
