import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calcularPresupuesto, Catalogo, costoManoDeObra, MotorApu, MontosTexto, RenglonPresupuesto } from '../src';

/**
 * Extractos reales de obras de Neodata y Opus (sin descripciones). El motor debe reproducir
 * al centavo cada matriz, cada renglón del presupuesto y el total.
 */
interface Fixture {
  fuente: string;
  catalogo: Catalogo;
  presupuesto: RenglonPresupuesto[];
  esperado: {
    manoDeObra?: Record<string, string>;
    matrices: Record<string, MontosTexto>;
    preciosUnitarios?: Record<string, MontosTexto>;
    renglones: Record<string, MontosTexto>;
    total: MontosTexto;
  };
}

const cargar = (nombre: string): Fixture => JSON.parse(readFileSync(join(__dirname, 'fixtures', nombre), 'utf8'));

/** Lista de diferencias legible para que una falla diga qué claves no cuadran. */
function diferencias(esperado: Record<string, unknown>, calculado: (clave: string) => unknown): string[] {
  return Object.entries(esperado)
    .filter(([clave, valor]) => JSON.stringify(calculado(clave)) !== JSON.stringify(valor))
    .map(([clave, valor]) => `${clave}: esperado ${JSON.stringify(valor)}, calculado ${JSON.stringify(calculado(clave))}`);
}

describe.each(['neodata-losas.json', 'opus-north-point.json'])('%s', (archivo) => {
  const fx = cargar(archivo);
  const motor = new MotorApu(fx.catalogo);

  it('reproduce el costo de mano de obra (salario base × FSR)', () => {
    const mo = fx.esperado.manoDeObra ?? {};
    const porClave = new Map(fx.catalogo.insumos.map((i) => [i.clave, i]));
    expect(diferencias(mo, (c) => costoManoDeObra(porClave.get(c)!.salarioBase!, porClave.get(c)!.fsr!))).toEqual([]);
  });

  it(`reproduce todas las matrices al centavo`, () => {
    expect(Object.keys(fx.esperado.matrices).length).toBeGreaterThan(0);
    expect(diferencias(fx.esperado.matrices, (c) => motor.matriz(c).costoDirecto)).toEqual([]);
  });

  it('reproduce cada renglón del presupuesto y el total', () => {
    const r = calcularPresupuesto(motor, fx.presupuesto);
    expect(diferencias(fx.esperado.preciosUnitarios ?? {}, (id) => r.renglones.get(id)!.precioUnitario)).toEqual([]);
    expect(diferencias(fx.esperado.renglones, (id) => r.renglones.get(id)!.importe)).toEqual([]);
    expect(r.total).toEqual(fx.esperado.total);
  });
});
