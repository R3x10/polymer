const LOTE = 1000;

/** Inserta en lotes para no rebasar el límite de parámetros de PostgreSQL con presupuestos grandes. */
export async function porLotes<T>(filas: T[], insertar: (lote: T[]) => Promise<unknown>) {
  for (let i = 0; i < filas.length; i += LOTE) await insertar(filas.slice(i, i + LOTE));
}
