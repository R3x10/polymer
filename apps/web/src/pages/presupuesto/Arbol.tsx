import { FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlignLeft,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  DollarSign,
  FolderPlus,
  Hash,
  Link2,
  Pencil,
  Plus,
  Ruler,
  Sigma,
  Trash2,
} from 'lucide-react';
import { Th } from '../../components/tabla';
import { api } from '../../lib/api';
import { cantidadTexto, dinero, mensajeError, RenglonArbol } from '../../lib/presupuestos';
import { CampoEditable, useDetalle, useIdPresupuesto, useMatrices, usePuedeEditar } from './comun';

interface Nodo {
  r: RenglonArbol;
  nivel: number;
}

/** Recorre el árbol en orden, saltando los hijos de las partidas plegadas. */
function aplanar(renglones: RenglonArbol[], plegadas: Set<string>): Nodo[] {
  const hijos = new Map<string | null, RenglonArbol[]>();
  for (const r of renglones) hijos.set(r.padreId, [...(hijos.get(r.padreId) ?? []), r]);
  const salida: Nodo[] = [];
  const visitar = (padre: string | null, nivel: number) => {
    for (const r of hijos.get(padre) ?? []) {
      salida.push({ r, nivel });
      if (r.tipo === 'partida' && !plegadas.has(r.id)) visitar(r.id, nivel + 1);
    }
  };
  visitar(null, 0);
  return salida;
}

export function Arbol() {
  const id = useIdPresupuesto();
  const puedeEditar = usePuedeEditar();
  const qc = useQueryClient();
  const { data } = useDetalle(id);
  const [plegadas, setPlegadas] = useState<Set<string>>(new Set());
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<'partida' | 'concepto' | null>(null);

  const nodos = useMemo(() => (data ? aplanar(data.renglones, plegadas) : []), [data, plegadas]);
  const refrescar = () => qc.invalidateQueries({ queryKey: ['presupuesto', id] });

  const cambiar = useMutation({
    mutationFn: ({ rid, cambios }: { rid: string; cambios: Record<string, string> }) =>
      api(`/presupuestos/${id}/renglones/${rid}`, { method: 'PATCH', body: cambios }),
    onSettled: refrescar,
  });
  const borrar = useMutation({
    mutationFn: (rid: string) => api(`/presupuestos/${id}/renglones/${rid}`, { method: 'DELETE' }),
    onSettled: refrescar,
  });

  if (!data) return null;
  const moneda = data.presupuesto.monedaBase;
  const partidaSeleccionada = data.renglones.find((r) => r.id === seleccion && r.tipo === 'partida');
  const alternar = (rid: string) =>
    setPlegadas((p) => {
      const n = new Set(p);
      if (n.has(rid)) n.delete(rid);
      else n.add(rid);
      return n;
    });
  const partidas = data.renglones.filter((r) => r.tipo === 'partida').map((r) => r.id);

  return (
    <>
      {formulario && <NuevoRenglon tipo={formulario} padreId={partidaSeleccionada?.id ?? null} cerrar={() => setFormulario(null)} />}
      {(cambiar.error || borrar.error) && <p className="error">{mensajeError(cambiar.error ?? borrar.error)}</p>}
      <div className="vista">
        <div className="herramientas">
          <button className="fantasma" onClick={() => setPlegadas(new Set())}>
            <ChevronsUpDown size={16} /> Expandir todo
          </button>
          <button className="fantasma" onClick={() => setPlegadas(new Set(partidas))}>
            <ChevronsDownUp size={16} /> Plegar todo
          </button>
          <span className="espacio" />
          {puedeEditar && (
            <>
              <span className="tenue pequeno">
                {partidaSeleccionada
                  ? `Dentro de ${partidaSeleccionada.clave || partidaSeleccionada.descripcion}`
                  : 'Haz clic en una partida para agregar dentro de ella'}
              </span>
              <button onClick={() => setFormulario('partida')}>
                <FolderPlus size={16} /> Agregar partida
              </button>
              <button className="primario" onClick={() => setFormulario('concepto')}>
                <Plus size={16} /> Agregar concepto
              </button>
            </>
          )}
        </div>
        {nodos.length === 0 ? (
          <p className="tenue vacio">El presupuesto está vacío. Empieza agregando una partida.</p>
        ) : (
          <div className="tabla-contenedor">
            <table className="tabla arbol">
              <thead>
                <tr>
                  <Th icono={<Hash size={14} />}>Clave</Th>
                  <Th icono={<AlignLeft size={14} />}>Descripción</Th>
                  <Th icono={<Ruler size={14} />}>Unidad</Th>
                  <Th icono={<Sigma size={14} />} num>
                    Cantidad
                  </Th>
                  <Th icono={<DollarSign size={14} />} num>
                    P. unitario
                  </Th>
                  <Th icono={<DollarSign size={14} />} num>
                    Importe
                  </Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {nodos.map(({ r, nivel }) => (
                  <tr
                    key={r.id}
                    className={`${r.tipo} ${seleccion === r.id ? 'seleccionado' : ''}`}
                    onClick={() => setSeleccion(r.tipo === 'partida' ? r.id : r.padreId)}
                  >
                    <td style={{ paddingLeft: `${0.75 + nivel * 1.1}rem` }} className="nowrap">
                      {r.tipo === 'partida' ? (
                        <button className="plegar" onClick={(e) => (e.stopPropagation(), alternar(r.id))} aria-label="Plegar o expandir">
                          {plegadas.has(r.id) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                        </button>
                      ) : null}
                      {puedeEditar ? (
                        <CampoEditable ancho="6.5rem" valor={r.clave} guardar={(v) => cambiar.mutate({ rid: r.id, cambios: { clave: v } })} />
                      ) : (
                        r.clave
                      )}
                      {r.tipo === 'concepto' && r.matrizClave !== r.clave && (
                        <span className="tenue pequeno" title="Este concepto usa el análisis de otra clave">
                          <Link2 size={12} /> {r.matrizClave}
                        </span>
                      )}
                    </td>
                    <td className="descripcion" title={r.descripcion}>
                      {r.tipo === 'partida' && puedeEditar ? (
                        <CampoEditable valor={r.descripcion} guardar={(v) => cambiar.mutate({ rid: r.id, cambios: { descripcion: v } })} />
                      ) : (
                        r.descripcion
                      )}
                    </td>
                    <td>{r.unidad}</td>
                    <td className="num">
                      {r.tipo === 'concepto' && (
                        <CampoEditable
                          className="num"
                          ancho="7rem"
                          deshabilitado={!puedeEditar}
                          valor={cantidadTexto(r.cantidad)}
                          guardar={(v) => cambiar.mutate({ rid: r.id, cambios: { cantidad: v } })}
                        />
                      )}
                    </td>
                    <td className="num">{r.tipo === 'concepto' && dinero(r.precioUnitario, moneda)}</td>
                    <td className="num">{dinero(r.importe, moneda)}</td>
                    <td className="acciones">
                      {r.tipo === 'concepto' && (
                        <Link className="boton" to={`matrices/${r.matrizId}`} onClick={(e) => e.stopPropagation()}>
                          <Pencil size={14} /> {puedeEditar ? 'Análisis' : 'Ver'}
                        </Link>
                      )}
                      {puedeEditar && (
                        <button
                          className="peligro"
                          onClick={(e) => {
                            e.stopPropagation();
                            const que = r.tipo === 'partida' ? `la partida ${r.clave} con todo su contenido` : `el concepto ${r.clave}`;
                            if (confirm(`¿Eliminar ${que} del presupuesto?`)) borrar.mutate(r.id);
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function NuevoRenglon({ tipo, padreId, cerrar }: { tipo: 'partida' | 'concepto'; padreId: string | null; cerrar: () => void }) {
  const id = useIdPresupuesto();
  const qc = useQueryClient();
  const { data: matrices } = useMatrices(id);
  const [clave, setClave] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [unidad, setUnidad] = useState('');
  const [cantidad, setCantidad] = useState('1');

  const existente = tipo === 'concepto' ? matrices?.find((m) => m.clave === clave.trim()) : undefined;
  const crear = useMutation({
    mutationFn: () =>
      api(`/presupuestos/${id}/renglones`, {
        method: 'POST',
        body:
          tipo === 'partida'
            ? { tipo, padreId, clave, descripcion }
            : { tipo, padreId, cantidad, ...(existente ? { matrizId: existente.id } : { nueva: { clave, descripcion, unidad } }) },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['presupuesto', id] });
      setClave('');
      setDescripcion('');
      setUnidad('');
      setCantidad('1');
    },
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    crear.mutate();
  };

  return (
    <form className="fila-form" onSubmit={enviar}>
      <strong>{tipo === 'partida' ? 'Nueva partida' : 'Nuevo concepto'}</strong>
      <input
        placeholder="Clave"
        value={clave}
        onChange={(e) => setClave(e.target.value)}
        list={tipo === 'concepto' ? 'conceptos-existentes' : undefined}
        required={tipo === 'concepto'}
        autoFocus
      />
      {tipo === 'concepto' && (
        <datalist id="conceptos-existentes">
          {matrices
            ?.filter((m) => m.tipo === 'concepto')
            .map((m) => (
              <option key={m.id} value={m.clave}>
                {m.descripcion.slice(0, 80)}
              </option>
            ))}
        </datalist>
      )}
      {existente ? (
        <span className="tenue pequeno descripcion-corta" title={existente.descripcion}>
          Concepto existente: {existente.descripcion.slice(0, 60)}
        </span>
      ) : (
        <>
          <input className="ancho" placeholder="Descripción" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} required />
          {tipo === 'concepto' && <input placeholder="Unidad" value={unidad} onChange={(e) => setUnidad(e.target.value)} style={{ width: '6rem' }} />}
        </>
      )}
      {tipo === 'concepto' && (
        <input placeholder="Cantidad" value={cantidad} onChange={(e) => setCantidad(e.target.value)} style={{ width: '7rem' }} required />
      )}
      <button type="submit" className="primario" disabled={crear.isPending}>
        Agregar
      </button>
      <button type="button" className="fantasma" onClick={cerrar}>
        Cerrar
      </button>
      {crear.error && <p className="error">{mensajeError(crear.error)}</p>}
    </form>
  );
}
