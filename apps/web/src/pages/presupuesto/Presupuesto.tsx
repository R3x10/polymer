import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Calculator, ListTree, Package } from 'lucide-react';
import { dinero } from '../../lib/presupuestos';
import { useDetalle, useIdPresupuesto } from './comun';

export function Presupuesto() {
  const id = useIdPresupuesto();
  const { data, error } = useDetalle(id);
  const importado = (useLocation().state as { importado?: { advertencias: string[]; totalOrigen: string } } | null)?.importado;

  if (error) return <p className="error">{error.message}</p>;
  if (!data) return <p className="tenue">Cargando…</p>;
  const { presupuesto, total } = data;

  return (
    <section>
      <div className="titulo-fila">
        <div>
          <p className="tenue pequeno">
            <Link to="/presupuestos">Presupuestos</Link> /
          </p>
          <h2>{presupuesto.nombre}</h2>
          <p className="tenue pequeno">
            {[presupuesto.cliente, presupuesto.ubicacion, presupuesto.origen && `Importado de ${presupuesto.origen}`].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="total">
          <span className="tenue pequeno">Costo directo</span>
          <strong>{dinero(total, presupuesto.monedaBase)}</strong>
        </div>
      </div>
      {importado && <AvisoImportacion total={total[presupuesto.monedaBase] ?? '0.00'} {...importado} />}
      <nav className="pestanas">
        <NavLink to="" end>
          <ListTree size={16} /> Presupuesto
        </NavLink>
        <NavLink to="matrices">
          <Calculator size={16} /> Análisis de precios
        </NavLink>
        <NavLink to="insumos">
          <Package size={16} /> Insumos
        </NavLink>
      </nav>
      <Outlet />
    </section>
  );
}

function AvisoImportacion({ total, totalOrigen, advertencias }: { total: string; totalOrigen: string; advertencias: string[] }) {
  const cuadra = Number(total).toFixed(2) === Number(totalOrigen).toFixed(2);
  return (
    <div className={`aviso ${cuadra ? 'ok' : 'alerta'}`}>
      {cuadra
        ? `Importado. El costo directo cuadra con el de Neodata: ${dinero({ MXN: totalOrigen })}.`
        : `Importado, pero el costo directo (${dinero({ MXN: total })}) no coincide con el de Neodata (${dinero({ MXN: totalOrigen })}).`}
      {advertencias.length > 0 && (
        <details>
          <summary>{advertencias.length} advertencias</summary>
          <ul>
            {advertencias.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
