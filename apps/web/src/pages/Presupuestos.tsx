import { FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, FileSpreadsheet, FileUp, Hash, Plus, Tag, Trash2, User } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { mensajeError, PresupuestoResumen } from '../lib/presupuestos';
import { Badge, Busqueda, Filtros, Th, usePaginacion } from '../components/tabla';
import { coincide } from './presupuesto/comun';

export function Presupuestos() {
  const { usuario } = useAuth();
  const puedeEditar = usuario?.rol !== 'consulta';
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['presupuestos'], queryFn: () => api<PresupuestoResumen[]>('/presupuestos') });
  const [panel, setPanel] = useState<'nuevo' | 'importar' | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtros, setFiltros] = useState<Record<string, string>>({});
  const filtrados = useMemo(
    () => (data ?? []).filter((p) => coincide(busqueda, p.nombre, p.cliente ?? '') && (!filtros.origen || (p.origen ?? 'Captura') === filtros.origen)),
    [data, busqueda, filtros],
  );
  const { visibles, control } = usePaginacion(filtrados, 15);
  const borrar = useMutation({
    mutationFn: (id: string) => api(`/presupuestos/${id}`, { method: 'DELETE' }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['presupuestos'] }),
  });

  return (
    <section>
      <div className="titulo-fila">
        <div>
          <h2>Presupuestos</h2>
          <p className="tenue">Obras con su catálogo de conceptos, análisis de precios e insumos.</p>
        </div>
      </div>
      {panel === 'nuevo' && <NuevoPresupuesto cerrar={() => setPanel(null)} />}
      {panel === 'importar' && <ImportarNeodata cerrar={() => setPanel(null)} />}
      <div className="vista">
        <div className="herramientas">
          <span className="tenue pequeno">{filtrados.length} presupuestos</span>
          <span className="espacio" />
          <Busqueda valor={busqueda} cambiar={setBusqueda} placeholder="Nombre o cliente" />
          {puedeEditar && (
            <>
              <button onClick={() => setPanel('importar')}>
                <FileUp size={16} /> Importar de Neodata
              </button>
              <button className="primario" onClick={() => setPanel('nuevo')}>
                <Plus size={16} /> Nuevo presupuesto
              </button>
            </>
          )}
        </div>
        <Filtros
          definiciones={[
            { clave: 'origen', etiqueta: 'Origen', icono: <Tag size={14} />, opciones: ['Captura', 'Neodata'].map((o) => ({ valor: o, etiqueta: o })) },
          ]}
          valores={filtros}
          cambiar={setFiltros}
        />
        <div className="tabla-contenedor">
          <table className="tabla">
            <thead>
              <tr>
                <Th icono={<FileSpreadsheet size={14} />}>Nombre</Th>
                <Th icono={<User size={14} />}>Cliente</Th>
                <Th icono={<Tag size={14} />}>Origen</Th>
                <Th icono={<Hash size={14} />} num>
                  Conceptos
                </Th>
                <Th icono={<Calendar size={14} />}>Modificado</Th>
                {puedeEditar && <Th>Acciones</Th>}
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
                    {data?.length
                      ? 'Ningún presupuesto coincide con la búsqueda.'
                      : 'Todavía no hay presupuestos. Crea uno nuevo o importa una obra de Neodata.'}
                  </td>
                </tr>
              ) : (
                visibles.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link to={`/presupuestos/${p.id}`}>
                        <strong>{p.nombre}</strong>
                      </Link>
                    </td>
                    <td>{p.cliente}</td>
                    <td>
                      <Badge color={p.origen ? 'morado' : 'azul'}>{p.origen ?? 'Captura'}</Badge>
                    </td>
                    <td className="num">{p.conceptos.toLocaleString('es-MX')}</td>
                    <td className="nowrap">{new Date(p.actualizadoEn).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                    {puedeEditar && (
                      <td className="acciones">
                        <button
                          className="peligro"
                          onClick={() => confirm(`¿Eliminar el presupuesto "${p.nombre}" con todo su contenido? No se puede deshacer.`) && borrar.mutate(p.id)}
                        >
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
      {borrar.error && <p className="error">{mensajeError(borrar.error)}</p>}
    </section>
  );
}

function NuevoPresupuesto({ cerrar }: { cerrar: () => void }) {
  const navegar = useNavigate();
  const qc = useQueryClient();
  const [nombre, setNombre] = useState('');
  const [cliente, setCliente] = useState('');
  const crear = useMutation({
    mutationFn: () => api<{ id: string }>('/presupuestos', { method: 'POST', body: { nombre, cliente: cliente || null } }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['presupuestos'] });
      navegar(`/presupuestos/${p.id}`);
    },
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    crear.mutate();
  };
  return (
    <form className="fila-form" onSubmit={enviar}>
      <strong>Nuevo presupuesto</strong>
      <input className="ancho" placeholder="Nombre de la obra" value={nombre} onChange={(e) => setNombre(e.target.value)} required autoFocus />
      <input placeholder="Cliente (opcional)" value={cliente} onChange={(e) => setCliente(e.target.value)} />
      <button type="submit" className="primario" disabled={crear.isPending}>
        Crear
      </button>
      <button type="button" className="fantasma" onClick={cerrar}>
        Cancelar
      </button>
      {crear.error && <p className="error">{mensajeError(crear.error)}</p>}
    </form>
  );
}

function ImportarNeodata({ cerrar }: { cerrar: () => void }) {
  const navegar = useNavigate();
  const qc = useQueryClient();
  const [archivo, setArchivo] = useState<File | null>(null);
  const importar = useMutation({
    mutationFn: () => {
      const datos = new FormData();
      datos.append('archivo', archivo!);
      return api<{ id: string; advertencias: string[]; totalOrigen: string }>('/presupuestos/importar/neodata', { method: 'POST', body: datos });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['presupuestos'] });
      navegar(`/presupuestos/${r.id}`, { state: { importado: r } });
    },
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (archivo) importar.mutate();
  };
  return (
    <form className="fila-form" onSubmit={enviar}>
      <strong>Importar de Neodata</strong>
      <span className="tenue pequeno">Archivo de intercambio (Xn_Presupuesto.xlsx o el .zip que lo contiene)</span>
      <input type="file" accept=".xlsx,.zip" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} required />
      <button type="submit" className="primario" disabled={!archivo || importar.isPending}>
        {importar.isPending ? 'Importando…' : 'Importar'}
      </button>
      <button type="button" className="fantasma" onClick={cerrar}>
        Cancelar
      </button>
      {importar.error && <p className="error">{mensajeError(importar.error)}</p>}
    </form>
  );
}
