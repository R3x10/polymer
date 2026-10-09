# Motor de precios unitarios

Cálculo puro (sin base de datos) de análisis de precios unitarios y presupuestos. Usa aritmética decimal exacta, nunca `number`, para el dinero.

## Regla de cálculo

Es la que reproduce a Neodata y Opus al centavo:

1. Importe de cada renglón = cantidad × costo del componente, redondeado a 2 decimales (mitad hacia arriba).
2. Si el componente es otra matriz (auxiliar o cuadrilla), su costo se calcula primero con esta misma regla.
3. Los insumos marcados como `porcentajeDeManoDeObra` (herramienta menor, equipo de seguridad) valen la suma de la mano de obra de esa matriz, incluidas las cuadrillas, y su cantidad es el porcentaje.
4. Costo directo de la matriz = suma de importes, por moneda (pesos y dólares por separado, como Opus).
5. Mano de obra con salario base y FSR: costo = salario base × FSR, redondeado.
6. Presupuesto: importe del concepto = cantidad × precio unitario, redondeado; las partidas suman a sus hijos.

Los sobrecostos (indirectos, financiamiento, utilidad, cargos adicionales) se agregan cuando tengamos una obra de ejemplo que los traiga aplicados para validarlos.

## Pruebas con obras reales

`test/fixtures` tiene extractos de obras reales, sin descripciones:

- `neodata-losas.json`: partida "Losas y Cubiertas" completa de un archivo de intercambio de Neodata (65 matrices, 46 conceptos, total $210,750.47).
- `opus-north-point.json`: presupuesto completo de una obra de Opus (395 matrices, 367 conceptos, 14 categorías de mano de obra, total $25,132,023.41 + USD 46,577.37).

Las pruebas exigen que cada matriz, cada renglón y el total cuadren al centavo.
