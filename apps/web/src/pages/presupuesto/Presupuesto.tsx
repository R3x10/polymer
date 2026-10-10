import { FormEvent, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Calculator, Copy, ListTree, Lock, Package } from 'lucide-react';
import { api } from '../../lib/api';
import { Badge } from '../../components/tabla';
import {
  COLOR_TIPO_PRESUPUESTO,
  DetallePresupuesto,
  dinero,
  ESTADOS_PRESUPUESTO,
  EstadoPresupuesto,
  ETAPAS_PRESUPUESTO,
  EtapaPresupuesto,
  mensajeError,
  TIPOS_PRESUPUESTO,
  TipoPresupuesto,
} from '../../lib/presupuestos';
import { useDetalle, useEsEditor, useIdPresupuesto } from './comun';

export function Presupuesto() {
  const id = useIdPresupuesto();
  const { data, error } = useDetalle(id);
  const esEditor = useEsEditor();
  const qc = useQueryClient();
  const [duplicando, setDuplicando] = useState(false);
  const importado = (
    useLocation().state as {
      importado?: { advertencias: string[]; totalOrigen: string };
    } | null
  )?.importado;
  const cambiarEstado = useMutation({
    mutationFn: (estado: EstadoPresupuesto) => api(`/presupuestos/${id}`, { method: 'PATCH', body: { estado } }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['presupuesto', id] });
      qc.invalidateQueries({ queryKey: ['presupuestos'] });
    },
  });

  if (error) return <p className="error">{error.message}</p>;
  if (!data) return <p className="tenue">Cargando…</p>;
  const { presupuesto, proyecto, total } = data;

  return (
    <section>
      <div className="titulo-fila">
        <div>
          <p className="tenue pequeno">
            <Link to="/presupuestos">Presupuestos</Link> / {proyecto.nombre} /
          </p>
          <h2>{presupuesto.nombre}</h2>
          <div className="etiquetas">
            <Badge color={COLOR_TIPO_PRESUPUESTO[presupuesto.tipo]}>{TIPOS_PRESUPUESTO[presupuesto.tipo]}</Badge>
            <Badge>{ETAPAS_PRESUPUESTO[presupuesto.etapa]}</Badge>
            {esEditor ? (
              <select
                className={`estado ${presupuesto.estado}`}
                value={presupuesto.estado}
                onChange={(e) => cambiarEstado.mutate(e.target.value as EstadoPresupuesto)}
                aria-label="Estado del presupuesto"
              >
                {Object.entries(ESTADOS_PRESUPUESTO).map(([v, e]) => (
                  <option key={v} value={v}>
                    {e}
                  </option>
                ))}
              </select>
            ) : (
              <Badge>{ESTADOS_PRESUPUESTO[presupuesto.estado]}</Badge>
            )}
            <span className="tenue pequeno">
              {[proyecto.cliente, proyecto.ubicacion, presupuesto.origen && `Importado de ${presupuesto.origen}`].filter(Boolean).join(' · ')}
            </span>
            {esEditor && (
              <button className="fantasma" onClick={() => setDuplicando(true)}>
                <Copy size={14} /> Duplicar
              </button>
            )}
          </div>
        </div>
        <div className="total">
          <span className="tenue pequeno">Costo directo</span>
          <strong>{dinero(total, presupuesto.monedaBase)}</strong>
        </div>
      </div>
      {cambiarEstado.error && <p className="error">{mensajeError(cambiarEstado.error)}</p>}
      {presupuesto.estado === 'congelado' && (
        <div className="aviso">
          <Lock size={14} /> Este presupuesto está congelado: solo se puede consultar. Cambia su estado para modificarlo.
        </div>
      )}
      {duplicando && <Duplicar datos={data} cerrar={() => setDuplicando(false)} />}
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

/** Copia el presupuesto completo, por ejemplo para pasar de venta a costo o de inicial a planificado. */
function Duplicar({ datos, cerrar }: { datos: DetallePresupuesto; cerrar: () => void }) {
  const { presupuesto } = datos;
  const navegar = useNavigate();
  const qc = useQueryClient();
  const otroTipo: TipoPresupuesto = presupuesto.tipo === 'venta' ? 'costo' : 'venta';
  const [tipo, setTipo] = useState<TipoPresupuesto>(otroTipo);
  const [etapa, setEtapa] = useState<EtapaPresupuesto>(presupuesto.etapa);
  const [nombre, setNombre] = useState(`Presupuesto de ${TIPOS_PRESUPUESTO[otroTipo].toLowerCase()}`);
  const duplicar = useMutation({
    mutationFn: () =>
      api<{ id: string }>(`/presupuestos/${presupuesto.id}/duplicar`, {
        method: 'POST',
        body: { nombre, tipo, etapa },
      }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['presupuestos'] });
      cerrar();
      navegar(`/presupuestos/${p.id}`);
    },
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    duplicar.mutate();
  };
  return (
    <form className="fila-form" onSubmit={enviar}>
      <strong>Duplicar como</strong>
      <input className="ancho" value={nombre} onChange={(e) => setNombre(e.target.value)} required autoFocus />
      <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoPresupuesto)}>
        {Object.entries(TIPOS_PRESUPUESTO).map(([v, e]) => (
          <option key={v} value={v}>
            {e}
          </option>
        ))}
      </select>
      <select value={etapa} onChange={(e) => setEtapa(e.target.value as EtapaPresupuesto)}>
        {Object.entries(ETAPAS_PRESUPUESTO).map(([v, e]) => (
          <option key={v} value={v}>
            {e}
          </option>
        ))}
      </select>
      <span className="tenue pequeno">Copia conceptos, análisis, insumos y cuantificaciones.</span>
      <button type="submit" className="primario" disabled={duplicar.isPending}>
        {duplicar.isPending ? 'Duplicando…' : 'Duplicar'}
      </button>
      <button type="button" className="fantasma" onClick={cerrar}>
        Cancelar
      </button>
      {duplicar.error && <p className="error">{mensajeError(duplicar.error)}</p>}
    </form>
  );
}
