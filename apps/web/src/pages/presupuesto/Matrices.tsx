import { FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { AlignLeft, DollarSign, Hash, Pencil, Plus, Ruler, Tag } from 'lucide-react';
import { COLOR_TIPO, dinero, mensajeError, TIPOS_MATRIZ, TipoMatriz } from '../../lib/presupuestos';
import { Badge, Busqueda, Filtros, Th, usePaginacion } from '../../components/tabla';
import { coincide, useDetalle, useIdPresupuesto, useMatrices, usePuedeEditar } from './comun';

export function Matrices() {
  const id = useIdPresupuesto();
  const puedeEditar = usePuedeEditar();
  const { data, isLoading } = useMatrices(id);
  const moneda = useDetalle(id).data?.presupuesto.monedaBase;
  const [busqueda, setBusqueda] = useState('');
  const [filtros, setFiltros] = useState<Record<string, string>>({ tipo: '' });
  const [nueva, setNueva] = useState(false);
  const filtradas = useMemo(
    () => (data ?? []).filter((m) => (!filtros.tipo || m.tipo === filtros.tipo) && coincide(busqueda, m.clave, m.descripcion)),
    [data, busqueda, filtros],
  );
  const { visibles, control } = usePaginacion(filtradas, 25);

  return (
    <>
      {nueva && puedeEditar && <NuevaMatriz cerrar={() => setNueva(false)} />}
      <div className="vista">
        <div className="herramientas">
          <span className="tenue pequeno">{filtradas.length.toLocaleString('es-MX')} análisis de precio unitario</span>
          <span className="espacio" />
          <Busqueda valor={busqueda} cambiar={setBusqueda} placeholder="Clave o descripción" />
          {puedeEditar && (
            <button className="primario" onClick={() => setNueva(true)}>
              <Plus size={16} /> Nuevo análisis
            </button>
          )}
        </div>
        <Filtros
          definiciones={[
            {
              clave: 'tipo',
              etiqueta: 'Tipo',
              icono: <Tag size={14} />,
              opciones: Object.entries(TIPOS_MATRIZ).map(([valor, etiqueta]) => ({ valor, etiqueta })),
            },
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
                  Costo directo
                </Th>
                <Th>Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="vacio">
                    Cargando…
                  </td>
                </tr>
              ) : visibles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="vacio">
                    No hay análisis que mostrar.
                  </td>
                </tr>
              ) : (
                visibles.map((m) => (
                  <tr key={m.id}>
                    <td className="nowrap">
                      <Link to={m.id}>{m.clave}</Link>
                    </td>
                    <td className="descripcion" title={m.descripcion}>
                      {m.descripcion}
                    </td>
                    <td>{m.unidad}</td>
                    <td>
                      <Badge color={COLOR_TIPO[m.tipo]}>{TIPOS_MATRIZ[m.tipo]}</Badge>
                    </td>
                    <td className="num">{dinero(m.costoDirecto, moneda)}</td>
                    <td className="acciones">
                      <Link className="boton" to={m.id}>
                        <Pencil size={14} /> {puedeEditar ? 'Editar' : 'Ver'}
                      </Link>
                    </td>
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

function NuevaMatriz({ cerrar }: { cerrar: () => void }) {
  const id = useIdPresupuesto();
  const qc = useQueryClient();
  const navegar = useNavigate();
  const [datos, setDatos] = useState({ clave: '', descripcion: '', unidad: '', tipo: 'auxiliar' as TipoMatriz });
  const crear = useMutation({
    mutationFn: () => api<{ id: string }>(`/presupuestos/${id}/matrices`, { method: 'POST', body: datos }),
    onSuccess: (m) => {
      qc.invalidateQueries({ queryKey: ['presupuesto', id] });
      navegar(m.id);
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
      <select value={datos.tipo} onChange={(e) => setDatos({ ...datos, tipo: e.target.value as TipoMatriz })}>
        {Object.entries(TIPOS_MATRIZ).map(([k, v]) => (
          <option key={k} value={k}>
            {v === 'Mano de obra' ? 'Cuadrilla (mano de obra)' : v}
          </option>
        ))}
      </select>
      <button type="submit" className="primario" disabled={crear.isPending}>
        Crear análisis
      </button>
      <button type="button" className="fantasma" onClick={cerrar}>
        Cerrar
      </button>
      {crear.error && <p className="error">{mensajeError(crear.error)}</p>}
    </form>
  );
}
