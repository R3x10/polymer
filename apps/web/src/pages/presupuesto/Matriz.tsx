import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { AlignLeft, ArrowLeft, DollarSign, Hash, Plus, Ruler, Sigma, Tag, Trash2 } from 'lucide-react';
import { cantidadTexto, COLOR_TIPO, DetalleMatriz, dinero, mensajeError, TIPOS_MATRIZ, TipoMatriz } from '../../lib/presupuestos';
import { Badge, Th } from '../../components/tabla';
import { CampoEditable, clavesPresupuesto, useDetalle, useIdPresupuesto, useInsumos, useMatrices, usePuedeEditar } from './comun';

interface Borrador {
  componente: string;
  cantidad: string;
}

export function Matriz() {
  const id = useIdPresupuesto();
  const mid = useParams<{ mid: string }>().mid!;
  const puedeEditar = usePuedeEditar();
  const qc = useQueryClient();
  const moneda = useDetalle(id).data?.presupuesto.monedaBase;
  const { data: m, error } = useQuery({
    queryKey: clavesPresupuesto.matriz(id, mid),
    queryFn: () => api<DetalleMatriz>(`/presupuestos/${id}/matrices/${mid}`),
  });
  const { data: insumos } = useInsumos(id);
  const { data: matrices } = useMatrices(id);

  const [borrador, setBorrador] = useState<Borrador[] | null>(null);
  useEffect(() => setBorrador(null), [mid]);
  const filas: Borrador[] = borrador ?? m?.renglones.map((r) => ({ componente: r.componente, cantidad: cantidadTexto(r.cantidad) })) ?? [];

  const componentes = useMemo(() => {
    const mapa = new Map<string, { descripcion: string; unidad: string; tipo: string; id: string; esMatriz: boolean }>();
    for (const i of insumos ?? []) mapa.set(i.clave, { descripcion: i.descripcion, unidad: i.unidad, tipo: i.tipo, id: i.id, esMatriz: false });
    for (const x of matrices ?? [])
      if (x.id !== mid) mapa.set(x.clave, { descripcion: x.descripcion, unidad: x.unidad, tipo: x.tipo, id: x.id, esMatriz: true });
    return mapa;
  }, [insumos, matrices, mid]);

  const refrescar = () => qc.invalidateQueries({ queryKey: ['presupuesto', id] });
  const guardar = useMutation({
    mutationFn: () =>
      api<DetalleMatriz>(`/presupuestos/${id}/matrices/${mid}/renglones`, { method: 'PUT', body: { renglones: filas.filter((f) => f.componente.trim()) } }),
    onSuccess: (nueva) => {
      qc.setQueryData(clavesPresupuesto.matriz(id, mid), nueva);
      setBorrador(null);
      refrescar();
    },
  });
  const cambiarDatos = useMutation({
    mutationFn: (cambios: { clave?: string; descripcion?: string; unidad?: string; tipo?: TipoMatriz }) =>
      api(`/presupuestos/${id}/matrices/${mid}`, { method: 'PATCH', body: cambios }),
    onSettled: refrescar,
  });

  if (error) return <p className="error">{error.message}</p>;
  if (!m) return <p className="tenue">Cargando…</p>;

  const sucio = borrador !== null;
  const editar = (i: number, cambio: Partial<Borrador>) => setBorrador(filas.map((f, j) => (j === i ? { ...f, ...cambio } : f)));
  const quitar = (i: number) => setBorrador(filas.filter((_, j) => j !== i));
  const agregar = () => setBorrador([...filas, { componente: '', cantidad: '1' }]);

  return (
    <div className="apu">
      <p className="pequeno">
        <Link to="..">
          <ArrowLeft size={14} style={{ verticalAlign: 'middle' }} /> Análisis de precios
        </Link>
      </p>
      <div className="titulo-fila">
        <div className="encabezado-apu">
          <CampoEditable deshabilitado={!puedeEditar} className="clave" ancho="10rem" valor={m.clave} guardar={(v) => cambiarDatos.mutate({ clave: v })} />
          <CampoEditable
            deshabilitado={!puedeEditar}
            className="ancho"
            valor={m.descripcion}
            placeholder="Descripción"
            guardar={(v) => cambiarDatos.mutate({ descripcion: v })}
          />
          <span className="compuesto">
            <span className="tenue">Unidad</span>
            <CampoEditable deshabilitado={!puedeEditar} ancho="5rem" valor={m.unidad} guardar={(v) => cambiarDatos.mutate({ unidad: v })} />
          </span>
          <Badge color={COLOR_TIPO[m.tipo]}>{TIPOS_MATRIZ[m.tipo]}</Badge>
        </div>
        <div className="total">
          <span className="tenue pequeno">Costo directo{sucio ? ' (sin guardar)' : ''}</span>
          <strong>{dinero(m.costoDirecto, moneda)}</strong>
        </div>
      </div>
      {cambiarDatos.error && <p className="error">{mensajeError(cambiarDatos.error)}</p>}

      <datalist id="componentes">
        {[...componentes].map(([clave, c]) => (
          <option key={clave} value={clave}>
            {c.descripcion.slice(0, 80)}
          </option>
        ))}
      </datalist>

      <div className="vista">
        <div className="tabla-contenedor">
          <table className="tabla">
            <thead>
              <tr>
                <Th icono={<Hash size={14} />}>Clave</Th>
                <Th icono={<AlignLeft size={14} />}>Descripción</Th>
                <Th icono={<Ruler size={14} />}>Unidad</Th>
                <Th icono={<Tag size={14} />}>Tipo</Th>
                <Th icono={<Sigma size={14} />} num>
                  Cantidad
                </Th>
                <Th icono={<DollarSign size={14} />} num>
                  Costo
                </Th>
                <Th icono={<DollarSign size={14} />} num>
                  Importe
                </Th>
                {puedeEditar && <Th>Acciones</Th>}
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => {
                // Mientras no se guarda, los importes de la fila son los del servidor solo si no cambió.
                const guardado = m.renglones[i];
                const igual = guardado && guardado.componente === f.componente && cantidadTexto(guardado.cantidad) === f.cantidad;
                const c = componentes.get(f.componente);
                return (
                  <tr key={i}>
                    <td className="nowrap">
                      {puedeEditar ? (
                        <input
                          className="en-linea"
                          list="componentes"
                          style={{ width: '9rem' }}
                          value={f.componente}
                          onChange={(e) => editar(i, { componente: e.target.value })}
                        />
                      ) : c?.esMatriz ? (
                        <Link to={`../${c.id}`}>{f.componente}</Link>
                      ) : (
                        f.componente
                      )}
                    </td>
                    <td className="descripcion" title={c?.descripcion}>
                      {c ? c.descripcion : f.componente && <span className="error">No existe esta clave</span>}
                      {c?.esMatriz && puedeEditar && (
                        <>
                          {' '}
                          <Link className="pequeno" to={`../${c.id}`}>
                            ver análisis
                          </Link>
                        </>
                      )}
                    </td>
                    <td>{c?.unidad}</td>
                    <td>{c && <Badge color={COLOR_TIPO[c.tipo as TipoMatriz]}>{TIPOS_MATRIZ[c.tipo as TipoMatriz]}</Badge>}</td>
                    <td className="num">
                      {puedeEditar ? (
                        <input
                          className="en-linea num"
                          style={{ width: '7rem' }}
                          value={f.cantidad}
                          onChange={(e) => editar(i, { cantidad: e.target.value })}
                        />
                      ) : (
                        f.cantidad
                      )}
                    </td>
                    <td className="num">{igual && (guardado.porcentajeManoObra ? `${dinero(guardado.costo, moneda)} MO` : dinero(guardado.costo, moneda))}</td>
                    <td className="num">{igual && dinero(guardado.importe, moneda)}</td>
                    {puedeEditar && (
                      <td className="acciones">
                        <button className="peligro" onClick={() => quitar(i)}>
                          <Trash2 size={14} /> Quitar
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              {Object.entries(m.porTipo).map(([t, montos]) => (
                <tr key={t} className="tenue">
                  <td colSpan={6}>{TIPOS_MATRIZ[t as TipoMatriz]}</td>
                  <td className="num">{dinero(montos, moneda)}</td>
                  {puedeEditar && <td />}
                </tr>
              ))}
              <tr className="partida">
                <td colSpan={6}>Costo directo</td>
                <td className="num">{dinero(m.costoDirecto, moneda)}</td>
                {puedeEditar && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
        {puedeEditar && (
          <div className="barra">
            <button onClick={agregar}>
              <Plus size={16} /> Agregar renglón
            </button>
            <span className="espacio" />
            {sucio && (
              <button className="secundario" onClick={() => setBorrador(null)}>
                Descartar cambios
              </button>
            )}
            <button className="primario" disabled={!sucio || guardar.isPending} onClick={() => guardar.mutate()}>
              {guardar.isPending ? 'Guardando…' : 'Guardar y recalcular'}
            </button>
          </div>
        )}
      </div>
      {guardar.error && <p className="error">{mensajeError(guardar.error)}</p>}
    </div>
  );
}
