import { describe, expect, it } from 'vitest';
import { calcularPresupuesto, Catalogo, ErrorDeCatalogo, MotorApu } from '.';

const catalogo: Catalogo = {
  insumos: [
    { clave: 'CEM', tipo: 'material', costo: { MXN: '3.333' } },
    { clave: 'PEON', tipo: 'mano_obra', salarioBase: '400', fsr: '1.8125' },
    { clave: 'OFI', tipo: 'mano_obra', costo: { MXN: '1000' } },
    { clave: 'HM', tipo: 'herramienta', porcentajeDeManoDeObra: true },
    { clave: 'GRUA', tipo: 'equipo', costo: { USD: '100' } },
  ],
  matrices: [
    { clave: 'CUAD', tipo: 'mano_obra', renglones: [{ componente: 'PEON', cantidad: 1 }, { componente: 'OFI', cantidad: '0.5' }] },
    { clave: 'MORTERO', tipo: 'auxiliar', renglones: [{ componente: 'CEM', cantidad: '1.5' }] },
    {
      clave: 'MURO',
      tipo: 'concepto',
      renglones: [
        { componente: 'HM', cantidad: '0.03' },
        { componente: 'MORTERO', cantidad: '2' },
        { componente: 'CUAD', cantidad: '0.125' },
        { componente: 'PEON', cantidad: '0.1' },
        { componente: 'GRUA', cantidad: '0.01' },
      ],
    },
  ],
};

describe('MotorApu', () => {
  const motor = new MotorApu(catalogo);

  it('redondea cada renglón a 2 decimales, mitad hacia arriba', () => {
    // 1.5 × 3.333 = 4.9995 → 5.00
    expect(motor.matriz('MORTERO').costoDirecto).toEqual({ MXN: '5.00' });
  });

  it('calcula la mano de obra como salario × FSR y las cuadrillas como matrices', () => {
    // PEON = 400 × 1.8125 = 725.00; CUAD = 725 + 500
    expect(motor.costo('PEON').aTexto()).toEqual({ MXN: '725.00' });
    expect(motor.matriz('CUAD').costoDirecto).toEqual({ MXN: '1225.00' });
  });

  it('calcula la herramienta menor como % de la mano de obra de la matriz, incluidas las cuadrillas', () => {
    const muro = motor.matriz('MURO');
    // MO = CUAD 0.125 × 1225 = 153.13 (153.125 redondeado) + PEON 0.1 × 725 = 72.50 → 225.63
    const hm = muro.renglones.find((r) => r.componente === 'HM')!;
    expect(hm.costo).toEqual({ MXN: '225.63' });
    expect(hm.importe).toEqual({ MXN: '6.77' });
    expect(muro.porTipo.mano_obra).toEqual({ MXN: '225.63' });
    // 6.77 + 10.00 + 225.63 en pesos, y la grúa en dólares por separado
    expect(muro.costoDirecto).toEqual({ MXN: '242.40', USD: '1.00' });
  });

  it('detecta referencias circulares y componentes inexistentes', () => {
    const ciclo = new MotorApu({
      insumos: [],
      matrices: [
        { clave: 'A', tipo: 'auxiliar', renglones: [{ componente: 'B', cantidad: 1 }] },
        { clave: 'B', tipo: 'auxiliar', renglones: [{ componente: 'A', cantidad: 1 }] },
      ],
    });
    expect(() => ciclo.matriz('A')).toThrow('Referencia circular: A → B → A');

    const huerfano = new MotorApu({ insumos: [], matrices: [{ clave: 'X', tipo: 'concepto', renglones: [{ componente: 'NO', cantidad: 1 }] }] });
    expect(() => huerfano.matriz('X')).toThrow(ErrorDeCatalogo);
  });

  it('rechaza claves repetidas', () => {
    expect(() => new MotorApu({ insumos: [catalogo.insumos[0], catalogo.insumos[0]], matrices: [] })).toThrow('Insumo repetido');
  });
});

describe('calcularPresupuesto', () => {
  it('multiplica cantidad × PU redondeando y suma partidas por moneda', () => {
    const r = calcularPresupuesto(new MotorApu(catalogo), [
      { id: 'A', tipo: 'partida' },
      { id: 'A1', padre: 'A', tipo: 'concepto', matriz: 'MURO', cantidad: '10.333' },
      { id: 'A2', padre: 'A', tipo: 'concepto', matriz: 'MORTERO', cantidad: 3 },
    ]);
    // 10.333 × 242.40 = 2504.7192 → 2504.72; 10.333 × 1.00 USD = 10.33
    expect(r.renglones.get('A1')!.importe).toEqual({ MXN: '2504.72', USD: '10.33' });
    expect(r.total).toEqual({ MXN: '2519.72', USD: '10.33' });
  });
});
