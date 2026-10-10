import { strToU8, zipSync } from 'fflate';

type Valor = string | number | null;

const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Arma un .xlsx mínimo como los que genera Neodata: celdas sin referencia ("r") y textos
 * en la tabla de cadenas compartidas.
 */
export function xlsxDePrueba(hojas: Record<string, Valor[][]>): Uint8Array {
  const cadenas: string[] = [];
  const indice = (s: string) => {
    const i = cadenas.indexOf(s);
    return i >= 0 ? i : cadenas.push(s) - 1;
  };
  const nombres = Object.keys(hojas);
  const archivos: Record<string, Uint8Array> = {};
  nombres.forEach((nombre, n) => {
    const filas = hojas[nombre]
      .map(
        (f) =>
          '<row>' +
          f.map((v) => (v === null ? '<c />' : typeof v === 'number' ? `<c><v>${v}</v></c>` : `<c t="s"><v>${indice(v)}</v></c>`)).join('') +
          '</row>',
      )
      .join('');
    archivos[`xl/worksheets/sheet${n + 1}.xml`] = strToU8(
      `<?xml version="1.0" encoding="utf-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${filas}</sheetData></worksheet>`,
    );
  });
  archivos['xl/workbook.xml'] = strToU8(
    `<?xml version="1.0" encoding="utf-8"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets>${nombres
      .map((n, i) => `<sheet name="${escapar(n)}" sheetId="${i + 1}" r:id="rId${i + 1}" />`)
      .join('')}</sheets></workbook>`,
  );
  archivos['xl/_rels/workbook.xml.rels'] = strToU8(
    `<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${nombres
      .map((_, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml" />`)
      .join('')}</Relationships>`,
  );
  archivos['xl/sharedStrings.xml'] = strToU8(
    `<?xml version="1.0" encoding="utf-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cadenas
      .map((s) => `<si><t>${escapar(s)}</t></si>`)
      .join('')}</sst>`,
  );
  return zipSync(archivos);
}

/** Obra de Neodata pequeña: muro con mortero (auxiliar), cuadrilla y herramienta menor 3 %. */
export function neodataDePrueba(): Uint8Array {
  const cat = ['Codigo', 'Descripcion completa', 'Descripcion', 'Unidad', 'Tipo', 'Familia', 'Agrupador', '%', 'Tipo %', 'Costo0'];
  return xlsxDePrueba({
    'N_Campos Generales': [
      ['DATOS', null, null],
      ['nombredelaobra', 'Nombre de la obra.', 'Casa Prueba'],
      ['ciudaddelaobra', 'Ciudad', 'Querétaro'],
    ],
    CatalogoGeneral: [
      cat,
      ['CEM', 'Cemento gris', 'Cemento', 'kg', 1, null, 0, 0, 0, 3.333],
      ['ARENA', 'Arena', 'Arena', 'm3', 1, null, 0, 0, 0, 450],
      ['PEON', 'Peón', 'Peón', 'jor', 2, null, 0, 0, 0, 725],
      ['OFI', 'Oficial albañil', 'Oficial', 'jor', 2, null, 0, 0, 0, 1000],
      ['HM', 'Herramienta menor', 'Herr', '%mo', 3, null, 0, 1, 2, 0],
      ['CUAD', 'Cuadrilla 1 of + 1 peón', 'Cuadrilla', 'jor', 2, null, 0, 0, 0, 1725],
      ['MORT', 'Mortero cemento-arena 1:4', 'Mortero', 'm3', 4, null, 0, 0, 0, 0],
      ['MURO', 'Muro de block 15 cm', 'Muro', 'm2', 4, null, 0, 0, 0, 0],
      ['SINUSO', 'Insumo del banco que no se usa', 'Sin uso', 'pza', 1, null, 0, 0, 0, 99],
    ],
    Presupuesto: [
      ['PartidaWBS', 'Partida', 'Codigo', 'Control', 'Renglon', 'Cantidad', 'CantidadTotal', 'Costo0'],
      ['1.01', '01.01', 'MURO', 1, 10, 120.5, 120.5, 0],
    ],
    Partidas: [
      ['PadreWbs', 'PartidaWbs', 'Partida', 'Renglon', 'DescripcionPartida', 'DescripcionPartidaLarga', 'Costo0'],
      ['', '1', 'A', 10, 'Obra negra', 'Obra negra', 23331.21],
      ['1', '1.01', '01', 10, 'Muros', 'Muros de block', 23331.21],
    ],
    Matrices: [
      ['CodigoM', 'CodigoI', 'Renglon', '/', 'Cantidad', 'Expresion'],
      ['CUAD', 'OFI', 10, '*', 1, null],
      ['CUAD', 'PEON', 20, '*', 1, null],
      ['MORT', 'CEM', 10, '*', 250, null],
      ['MORT', 'ARENA', 20, '*', 1.1, null],
      ['MURO', 'MORT', 10, '*', 0.012, null],
      ['MURO', 'CUAD', 20, '*', 0.1, null],
      ['MURO', 'HM', 30, '*', 0.03, null],
    ],
  });
}
