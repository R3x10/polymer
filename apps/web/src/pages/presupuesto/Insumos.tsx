import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { AlignLeft, Coins, DollarSign, Hash, Plus, Ruler, Tag, Trash2 } from 'lucide-react';
import { cantidadTexto, COLOR_TIPO, Insumo, mensajeError, TIPOS_INSUMO, TipoInsumo } from '../../lib/presupuestos';
import { Badge, Busqueda, Filtros, Th, usePaginacion } from '../../components/tabla';
import { CampoEditable, coincide, useIdPresupuesto, useInsumos, usePuedeEditar } from './comun';

export function Insumos() {
  const id = useIdPresupuesto();
  const puedeEditar = usePuedeEditar();
  const qc = useQueryClient();
  const { data, isLoading } = useInsumos(id);
  const [busqueda, setBusqueda] = useState('');
  const [filtros, setFiltros] = useState<Record<string, string>>({ tipo: '' });
  const [nuevo, setNuevo] = useState(false);

  const filtrados = useMemo(
    () =>
      (data ?? []).filter(
        (i) => (!filtros.tipo || i.tipo === filtros.tipo) && (!filtros.moneda || i.moneda === filtros.moneda) && coincide(busqueda, i.clave, i.descripcion),
      ),
    [data, busqueda, filtros],
  );
  const { visibles, control } = usePaginacion(filtrados, 25);
  const monedas = [...new Set((data ?? []).map((i) => i.moneda))];

  const cambiar = useMutation({
    mutationFn: ({ iid, cambios }: { iid: string; cambios: Partial<Insumo> }) => api(`/presupuestos/${id}/insumos/${iid}`, { method: 'PATCH', body: cambios }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['presupuesto', id] }),
  });
  const borrar = useMutation({
    mutationFn: (iid: string) => api(`/presupuestos/${id}/insumos/${iid}`, { method: 'DELETE' }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['presupuesto', id] }),
  });

  return (
    <>
      {nuevo && puedeEditar && <NuevoInsumo cerrar={() => setNuevo(false)} />}
      {(cambiar.error || borrar.error) && <p className="error">{mensajeError(cambiar.error ?? borrar.error)}</p>}
      <div className="vista">
        <div className="herramientas">
          <span className="tenue pequeno">{filtrados.length.toLocaleString('es-MX')} insumos · los costos se editan directo en la tabla</span>
          <span className="espacio" />
          <Busqueda valor={busqueda} cambiar={setBusqueda} placeholder="Clave o descripción" />
          {puedeEditar && (
            <button className="primario" onClick={() => setNuevo(true)}>
              <Plus size={16} /> Agregar insumo
            </button>
          )}
        </div>
        <Filtros
          definiciones={[
            {
              clave: 'tipo',
              etiqueta: 'Tipo',
              icono: <Tag size={14} />,
              opciones: Object.entries(TIPOS_INSUMO).map(([valor, etiqueta]) => ({ valor, etiqueta })),
            },
            { clave: 'moneda', etiqueta: 'Moneda', icono: <Coins size={14} />, opciones: monedas.map((m) => ({ valor: m, etiqueta: m })) },
          ]}
          valores={filtros}
          cambiar={setFiltros}
        />
        <div className="tabla-contenedor">
          <table className="tabla">
            <thead>
              <tr>
                <Th icono={<Hash size={14} />}>Clave</Th>
                <Th icono={<AlignLeft size={14} />}>Descripción</Th>
                <Th icono={<Ruler size={14} />}>Unidad</Th>
                <Th icono={<Tag size={14} />}>Tipo</Th>
                <Th icono={<DollarSign size={14} />} num>
                  Costo
                </Th>
                <Th icono={<Coins size={14} />}>Moneda</Th>
                {puedeEditar && <Th>Acciones</Th>}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="vacio">
                    Cargando…
                  </td>
                </tr>
              ) : visibles.length === 0 ? (
                <tr>
                  <td colSpan={7} className="vacio">
                    No hay insumos que mostrar.
                  </td>
                </tr>
              ) : (
                visibles.map((i) => (
                  <tr key={i.id}>
                    <td className="nowrap">{i.clave}</td>
                    <td className="descripcion" title={i.descripcion}>
                      <CampoEditable
                        deshabilitado={!puedeEditar}
                        valor={i.descripcion}
                        guardar={(v) => cambiar.mutate({ iid: i.id, cambios: { descripcion: v } })}
                      />
                    </td>
                    <td>
                      <CampoEditable
                        deshabilitado={!puedeEditar}
                        ancho="5rem"
                        valor={i.unidad}
                        guardar={(v) => cambiar.mutate({ iid: i.id, cambios: { unidad: v } })}
                      />
                    </td>
                    <td>
                      <Badge color={COLOR_TIPO[i.tipo]}>{TIPOS_INSUMO[i.tipo]}</Badge>
                    </td>
                    <td className="num nowrap">
                      <Costo insumo={i} puedeEditar={puedeEditar} guardar={(cambios) => cambiar.mutate({ iid: i.id, cambios })} />
                    </td>
                    <td>{i.moneda}</td>
                    {puedeEditar && (
                      <td className="acciones">
                        <button className="peligro" onClick={() => confirm(`¿Eliminar el insumo ${i.clave}?`) && borrar.mutate(i.id)}>
                          <Trash2 size={14} /> Eliminar
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {control}
      </div>
    </>
  );
}

/** El costo se edita directo, salvo mano de obra con FSR (salario × FSR) y los % de mano de obra. */
function Costo({ insumo: i, puedeEditar, guardar }: { insumo: Insumo; puedeEditar: boolean; guardar: (c: Partial<Insumo>) => void }) {
  if (i.porcentajeManoObra) return <span className="tenue">% de mano de obra</span>;
  if (i.salarioBase !== null && i.fsr !== null) {
    return (
      <span className="compuesto">
        <CampoEditable
          deshabilitado={!puedeEditar}
          className="num"
          ancho="6rem"
          valor={cantidadTexto(i.salarioBase)}
          guardar={(v) => guardar({ salarioBase: v })}
        />
        <span className="tenue">× FSR</span>
        <CampoEditable deshabilitado={!puedeEditar} className="num" ancho="5rem" valor={cantidadTexto(i.fsr)} guardar={(v) => guardar({ fsr: v })} />
        <span>= {Number(i.costoCalculado).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
      </span>
    );
  }
  return <CampoEditable deshabilitado={!puedeEditar} className="num" ancho="8rem" valor={cantidadTexto(i.costo)} guardar={(v) => guardar({ costo: v })} />;
}

function NuevoInsumo({ cerrar }: { cerrar: () => void }) {
  const id = useIdPresupuesto();
  const qc = useQueryClient();
  const vacio = { clave: '', descripcion: '', unidad: '', tipo: 'material' as TipoInsumo, costo: '', moneda: 'MXN', porcentajeManoObra: false };
  const [datos, setDatos] = useState(vacio);
  const crear = useMutation({
    mutationFn: () => api(`/presupuestos/${id}/insumos`, { method: 'POST', body: { ...datos, costo: datos.costo || '0' } }),
    onSuccess: () => {
      setDatos(vacio);
      qc.invalidateQueries({ queryKey: ['presupuesto', id] });
    },
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    crear.mutate();
  };
  return (
    <form className="fila-form" onSubmit={enviar}>
      <input placeholder="Clave" value={datos.clave} onChange={(e) => setDatos({ ...datos, clave: e.target.value })} required style={{ width: '8rem' }} />
      <input className="ancho" placeholder="Descripción" value={datos.descripcion} onChange={(e) => setDatos({ ...datos, descripcion: e.target.value })} />
      <input placeholder="Unidad" value={datos.unidad} onChange={(e) => setDatos({ ...datos, unidad: e.target.value })} style={{ width: '5rem' }} />
      <select value={datos.tipo} onChange={(e) => setDatos({ ...datos, tipo: e.target.value as TipoInsumo })}>
        {Object.entries(TIPOS_INSUMO).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      <label className="pequeno">
        <input type="checkbox" checked={datos.porcentajeManoObra} onChange={(e) => setDatos({ ...datos, porcentajeManoObra: e.target.checked })} /> % de mano de
        obra
      </label>
      {!datos.porcentajeManoObra && (
        <input placeholder="Costo" value={datos.costo} onChange={(e) => setDatos({ ...datos, costo: e.target.value })} style={{ width: '7rem' }} />
      )}
      <select value={datos.moneda} onChange={(e) => setDatos({ ...datos, moneda: e.target.value })}>
        <option>MXN</option>
        <option>USD</option>
      </select>
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
