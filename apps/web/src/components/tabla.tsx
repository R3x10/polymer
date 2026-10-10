import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Plus, Search, X } from 'lucide-react';

/** Encabezado de columna con icono, como en Notion. */
export function Th({ icono, children, num }: { icono?: ReactNode; children?: ReactNode; num?: boolean }) {
  return (
    <th className={num ? 'num' : undefined}>
      <span className="th">
        {icono}
        {children}
      </span>
    </th>
  );
}

export type ColorBadge = 'gris' | 'azul' | 'verde' | 'amarillo' | 'naranja' | 'rojo' | 'morado' | 'rosa';

export function Badge({ color = 'gris', punto, children }: { color?: ColorBadge; punto?: boolean; children: ReactNode }) {
  return (
    <span className={`badge ${color} ${punto ? 'con-punto' : ''}`}>
      {punto && <span className="punto" />}
      {children}
    </span>
  );
}

/** Búsqueda que se muestra como botón y se abre al usarla. */
export function Busqueda({ valor, cambiar, placeholder = 'Buscar' }: { valor: string; cambiar: (v: string) => void; placeholder?: string }) {
  const [abierta, setAbierta] = useState(valor !== '');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (abierta) ref.current?.focus();
  }, [abierta]);
  if (!abierta) {
    return (
      <button className="boton fantasma" onClick={() => setAbierta(true)}>
        <Search size={16} /> Buscar
      </button>
    );
  }
  return (
    <span className="busqueda">
      <Search size={16} />
      <input
        ref={ref}
        value={valor}
        placeholder={placeholder}
        onChange={(e) => cambiar(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && (cambiar(''), setAbierta(false))}
        onBlur={() => valor === '' && setAbierta(false)}
      />
      {valor && (
        <button className="icono" onClick={() => cambiar('')} aria-label="Limpiar búsqueda">
          <X size={14} />
        </button>
      )}
    </span>
  );
}

export interface DefinicionFiltro {
  clave: string;
  etiqueta: string;
  icono?: ReactNode;
  opciones: { valor: string; etiqueta: string }[];
}

/**
 * Filtros como chips ("Tipo: Material ▾") con "Agregar filtro" para los que no están activos.
 * `valores` guarda el valor elegido por filtro; cadena vacía = todos.
 */
export function Filtros({
  definiciones,
  valores,
  cambiar,
}: {
  definiciones: DefinicionFiltro[];
  valores: Record<string, string>;
  cambiar: (v: Record<string, string>) => void;
}) {
  const [visibles, setVisibles] = useState<string[]>(() => Object.keys(valores).filter((k) => valores[k] !== undefined));
  const [menu, setMenu] = useState(false);
  const ocultos = definiciones.filter((d) => !visibles.includes(d.clave));
  const poner = (clave: string, valor: string) => cambiar({ ...valores, [clave]: valor });
  const quitar = (clave: string) => {
    setVisibles(visibles.filter((v) => v !== clave));
    const { [clave]: _, ...resto } = valores;
    cambiar(resto);
  };

  return (
    <div className="filtros">
      {definiciones
        .filter((d) => visibles.includes(d.clave))
        .map((d) => {
          const actual = d.opciones.find((o) => o.valor === valores[d.clave]);
          return (
            <span key={d.clave} className={`chip ${actual ? 'activo' : ''}`}>
              {d.icono}
              <select value={valores[d.clave] ?? ''} onChange={(e) => poner(d.clave, e.target.value)} aria-label={d.etiqueta}>
                <option value="">{d.etiqueta}</option>
                {d.opciones.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {d.etiqueta}: {o.etiqueta}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="flecha" />
              <button className="icono" onClick={() => quitar(d.clave)} aria-label={`Quitar filtro ${d.etiqueta}`}>
                <X size={12} />
              </button>
            </span>
          );
        })}
      {ocultos.length > 0 && (
        <span className="menu-contenedor">
          <button className="boton fantasma pequeno" onClick={() => setMenu(!menu)}>
            <Plus size={14} /> Agregar filtro
          </button>
          {menu && (
            <span className="menu" onMouseLeave={() => setMenu(false)}>
              {ocultos.map((d) => (
                <button
                  key={d.clave}
                  onClick={() => {
                    setVisibles([...visibles, d.clave]);
                    setMenu(false);
                  }}
                >
                  {d.icono}
                  {d.etiqueta}
                </button>
              ))}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

const TAMANOS = [15, 25, 50, 100];

/** Pagina una lista en el cliente y devuelve la página visible y el control de paginación. */
export function usePaginacion<T>(filas: T[], inicial = 25) {
  const [porPagina, setPorPagina] = useState(inicial);
  const [pagina, setPagina] = useState(1);
  const paginas = Math.max(1, Math.ceil(filas.length / porPagina));
  useEffect(() => {
    if (pagina > paginas) setPagina(paginas);
  }, [pagina, paginas]);
  const visibles = useMemo(() => filas.slice((pagina - 1) * porPagina, pagina * porPagina), [filas, pagina, porPagina]);
  const control = (
    <Paginacion
      total={filas.length}
      pagina={Math.min(pagina, paginas)}
      porPagina={porPagina}
      cambiarPagina={setPagina}
      cambiarPorPagina={(n) => {
        setPorPagina(n);
        setPagina(1);
      }}
    />
  );
  return { visibles, control, reiniciar: () => setPagina(1) };
}

function Paginacion({
  total,
  pagina,
  porPagina,
  cambiarPagina,
  cambiarPorPagina,
}: {
  total: number;
  pagina: number;
  porPagina: number;
  cambiarPagina: (p: number) => void;
  cambiarPorPagina: (n: number) => void;
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const desde = total === 0 ? 0 : (pagina - 1) * porPagina + 1;
  const hasta = Math.min(total, pagina * porPagina);
  const numeros = [...new Set([1, pagina - 1, pagina, pagina + 1, paginas])].filter((p) => p >= 1 && p <= paginas).sort((a, b) => a - b);

  return (
    <div className="paginacion">
      <span className="tenue">Filas por página</span>
      <select value={porPagina} onChange={(e) => cambiarPorPagina(Number(e.target.value))}>
        {TAMANOS.map((n) => (
          <option key={n}>{n}</option>
        ))}
      </select>
      <span className="tenue">
        {desde}-{hasta} de {total.toLocaleString('es-MX')} filas
      </span>
      <span className="espacio" />
      <button className="boton cuadrado" disabled={pagina === 1} onClick={() => cambiarPagina(1)} aria-label="Primera página">
        <ChevronsLeft size={16} />
      </button>
      <button className="boton cuadrado" disabled={pagina === 1} onClick={() => cambiarPagina(pagina - 1)} aria-label="Página anterior">
        <ChevronLeft size={16} />
      </button>
      {numeros.map((p, i) => (
        <span key={p} className="compuesto">
          {i > 0 && p - numeros[i - 1] > 1 && <span className="tenue">…</span>}
          <button className={`boton cuadrado ${p === pagina ? 'actual' : 'fantasma'}`} onClick={() => cambiarPagina(p)}>
            {p}
          </button>
        </span>
      ))}
      <button className="boton cuadrado" disabled={pagina === paginas} onClick={() => cambiarPagina(pagina + 1)} aria-label="Página siguiente">
        <ChevronRight size={16} />
      </button>
      <button className="boton cuadrado" disabled={pagina === paginas} onClick={() => cambiarPagina(paginas)} aria-label="Última página">
        <ChevronsRight size={16} />
      </button>
    </div>
  );
}
