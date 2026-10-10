import { describe, expect, it } from 'vitest';
import { calcularCuantificacion, ErrorDeFormula, evaluarExpresion } from '.';

describe('evaluarExpresion', () => {
  it('respeta la precedencia, paréntesis y signos', () => {
    expect(evaluarExpresion('2+3*4').toString()).toBe('14');
    expect(evaluarExpresion('(2+3)*4').toString()).toBe('20');
    expect(evaluarExpresion('-2*-3 + .5').toString()).toBe('6.5');
    expect(evaluarExpresion('10/4').toString()).toBe('2.5');
  });

  it('usa decimales exactos, no punto flotante', () => {
    expect(evaluarExpresion('0.1+0.2').toString()).toBe('0.3');
  });

  it('rechaza fórmulas inválidas', () => {
    for (const f of ['', '2+', '(2', '2)', '2/0', '2 & 3', 'x*2']) expect(() => evaluarExpresion(f)).toThrow(ErrorDeFormula);
  });
});

describe('calcularCuantificacion', () => {
  it('multiplica las medidas capturadas y suma los renglones, con descuentos', () => {
    const r = calcularCuantificacion([
      { piezas: '2', largo: '5.25', alto: '2.40' }, // 25.2
      { largo: '3', ancho: '0.15', alto: '2.4' }, // 1.08
      { piezas: '-1', largo: '0.9', alto: '2.1' }, // vano de puerta: -1.89
      {}, // renglón vacío: 0
    ]);
    expect(r.resultados).toEqual(['25.200000', '1.080000', '-1.890000', '0.000000']);
    expect(r.total).toBe('24.390000');
  });

  it('evalúa la fórmula con las medidas como variables', () => {
    const r = calcularCuantificacion([
      { piezas: '4', largo: '3', alto: '2.5', formula: 'P*(L+0.30)*H' }, // 33
      { formula: '12.5 + 3*2' }, // 18.5
      { largo: '2', formula: 'L*A' }, // ancho no capturado vale 1
    ]);
    expect(r.resultados).toEqual(['33.000000', '18.500000', '2.000000']);
    expect(r.total).toBe('53.500000');
  });

  it('redondea cada renglón antes de sumar', () => {
    expect(calcularCuantificacion([{ formula: '1/3' }, { formula: '1/3' }, { formula: '1/3' }], 2).total).toBe('0.99');
  });

  it('avisa si una medida no es número', () => {
    expect(() => calcularCuantificacion([{ largo: '3,5' }])).toThrow(/Largo no es un número/);
  });
});
