import { FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, CircleDot, FileSpreadsheet, FileUp, Flag, FolderKanban, Hash, Layers, Plus, Tag, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  COLOR_ESTADO,
  COLOR_TIPO_PRESUPUESTO,
  ESTADOS_PRESUPUESTO,
  ETAPAS_PRESUPUESTO,
  EtapaPresupuesto,
  mensajeError,
  PresupuestoResumen,
  Proyecto,
  TIPOS_PRESUPUESTO,
  TipoPresupuesto,
} from '../lib/presupuestos';
import { Badge, Busqueda, Filtros, Th, usePaginacion } from '../components/tabla';
import { coincide } from './presupuesto/comun';

export function Presupuestos() {
  const { usuario } = useAuth();
  const puedeEditar = usuario?.rol !== 'consulta';
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['presupuestos'],
    queryFn: () => api<PresupuestoResumen[]>('/presupuestos'),
  });
  const [panel, setPanel] = useState<'nuevo' | 'importar' | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtros, setFiltros] = useState<Record<string, string>>({});
  const filtrados = useMemo(
    () =>
      (data ?? []).filter(
        (p) =>
          coincide(busqueda, p.nombre, p.proyecto, p.cliente ?? '') &&
          (!filtros.proyecto || p.proyecto === filtros.proyecto) &&
          (!filtros.tipo || p.tipo === filtros.tipo) &&
          (!filtros.etapa || p.etapa === filtros.etapa) &&
          (!filtros.estado || p.estado === filtros.estado) &&
          (!filtros.origen || (p.origen ?? 'Captura') === filtros.origen),
      ),
    [data, busqueda, filtros],
  );
  const nombresProyecto = useMemo(() => [...new Set((data ?? []).map((p) => p.proyecto))].sort((a, b) => a.localeCompare(b, 'es')), [data]);
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
          <p className="tenue">Cada proyecto puede tener varios presupuestos: venta y costo, inicial y planificado.</p>
        </div>
      </div>
      {panel === 'nuevo' && <NuevoPresupuesto cerrar={() => setPanel(null)} />}
      {panel === 'importar' && <ImportarNeodata cerrar={() => setPanel(null)} />}
      <div className="vista">
        <div className="herramientas">
          <span className="tenue pequeno">{filtrados.length} presupuestos</span>
          <span className="espacio" />
          <Busqueda valor={busqueda} cambiar={setBusqueda} placeholder="Proyecto, nombre o cliente" />
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
            {
              clave: 'proyecto',
              etiqueta: 'Proyecto',
              icono: <FolderKanban size={14} />,
              opciones: nombresProyecto.map((n) => ({ valor: n, etiqueta: n })),
            },
            {
              clave: 'tipo',
              etiqueta: 'Tipo',
              icono: <Tag size={14} />,
              opciones: opciones(TIPOS_PRESUPUESTO),
            },
            {
              clave: 'etapa',
              etiqueta: 'Etapa',
              icono: <Layers size={14} />,
              opciones: opciones(ETAPAS_PRESUPUESTO),
            },
            {
              clave: 'estado',
              etiqueta: 'Estado',
              icono: <CircleDot size={14} />,
              opciones: opciones(ESTADOS_PRESUPUESTO),
            },
            {
              clave: 'origen',
              etiqueta: 'Origen',
              icono: <Tag size={14} />,
              opciones: ['Captura', 'Neodata'].map((o) => ({
                valor: o,
                etiqueta: o,
              })),
            },
          ]}
          valores={filtros}
          cambiar={setFiltros}
        />
        <div className="tabla-contenedor">
          <table className="tabla">
            <thead>
              <tr>
                <Th icono={<FolderKanban size={14} />}>Proyecto</Th>
                <Th icono={<FileSpreadsheet size={14} />}>Presupuesto</Th>
                <Th icono={<Tag size={14} />}>Tipo</Th>
                <Th icono={<Layers size={14} />}>Etapa</Th>
                <Th icono={<CircleDot size={14} />}>Estado</Th>
                <Th icono={<Flag size={14} />}>Origen</Th>
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
                  <td colSpan={9} className="vacio">
                    Cargando…
                  </td>
                </tr>
              ) : visibles.length === 0 ? (
                <tr>
                  <td colSpan={9} className="vacio">
                    {data?.length
                      ? 'Ningún presupuesto coincide con la búsqueda.'
                      : 'Todavía no hay presupuestos. Crea uno nuevo o importa una obra de Neodata.'}
                  </td>
                </tr>
              ) : (
                visibles.map((p) => (
                  <tr key={p.id}>
                    <td title={p.cliente ?? undefined}>{p.proyecto}</td>
                    <td>
                      <Link to={`/presupuestos/${p.id}`}>
                        <strong>{p.nombre}</strong>
                      </Link>
                    </td>
                    <td>
                      <Badge color={COLOR_TIPO_PRESUPUESTO[p.tipo]}>{TIPOS_PRESUPUESTO[p.tipo]}</Badge>
                    </td>
                    <td>{ETAPAS_PRESUPUESTO[p.etapa]}</td>
                    <td>
                      <Badge color={COLOR_ESTADO[p.estado]} punto>
                        {ESTADOS_PRESUPUESTO[p.estado]}
                      </Badge>
                    </td>
                    <td>
                      <Badge color={p.origen ? 'morado' : 'azul'}>{p.origen ?? 'Captura'}</Badge>
                    </td>
                    <td className="num">{p.conceptos.toLocaleString('es-MX')}</td>
                    <td className="nowrap">
                      {new Date(p.actualizadoEn).toLocaleString('es-MX', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </td>
                    {puedeEditar && (
                      <td className="acciones">
                        <button
                          className="peligro"
                          disabled={p.estado === 'congelado'}
                          title={p.estado === 'congelado' ? 'Está congelado' : undefined}
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

const opciones = (m: Record<string, string>) => Object.entries(m).map(([valor, etiqueta]) => ({ valor, etiqueta }));

const useProyectos = () =>
  useQuery({
    queryKey: ['proyectos'],
    queryFn: () => api<Proyecto[]>('/proyectos'),
  });

function NuevoPresupuesto({ cerrar }: { cerrar: () => void }) {
  const navegar = useNavigate();
  const qc = useQueryClient();
  const { data: proyectos } = useProyectos();
  const [proyecto, setProyecto] = useState('');
  const [nombre, setNombre] = useState('Presupuesto de venta');
  const [tipo, setTipo] = useState<TipoPresupuesto>('venta');
  const [etapa, setEtapa] = useState<EtapaPresupuesto>('inicial');
  const crear = useMutation({
    mutationFn: () =>
      api<{ id: string }>('/presupuestos', {
        method: 'POST',
        body: { proyecto, nombre, tipo, etapa },
      }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['presupuestos'] });
      qc.invalidateQueries({ queryKey: ['proyectos'] });
      navegar(`/presupuestos/${p.id}`);
    },
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    crear.mutate();
  };
  const existente = proyectos?.some((p) => p.nombre.toLowerCase() === proyecto.trim().toLowerCase());
  return (
    <form className="fila-form" onSubmit={enviar}>
      <strong>Nuevo presupuesto</strong>
      <input list="proyectos-existentes" placeholder="Proyecto (obra)" value={proyecto} onChange={(e) => setProyecto(e.target.value)} required autoFocus />
      <datalist id="proyectos-existentes">
        {proyectos?.map((p) => (
          <option key={p.id} value={p.nombre} />
        ))}
      </datalist>
      {proyecto.trim() && !existente && <span className="tenue pequeno">Se creará el proyecto</span>}
      <input className="ancho" placeholder="Nombre del presupuesto" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
      <select
        value={tipo}
        onChange={(e) => {
          const t = e.target.value as TipoPresupuesto;
          if (nombre === `Presupuesto de ${TIPOS_PRESUPUESTO[tipo].toLowerCase()}`) setNombre(`Presupuesto de ${TIPOS_PRESUPUESTO[t].toLowerCase()}`);
          setTipo(t);
        }}
      >
        {opciones(TIPOS_PRESUPUESTO).map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.etiqueta}
          </option>
        ))}
      </select>
      <select value={etapa} onChange={(e) => setEtapa(e.target.value as EtapaPresupuesto)}>
        {opciones(ETAPAS_PRESUPUESTO).map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.etiqueta}
          </option>
        ))}
      </select>
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
  const { data: proyectos } = useProyectos();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [proyectoId, setProyectoId] = useState('');
  const importar = useMutation({
    mutationFn: () => {
      const datos = new FormData();
      datos.append('archivo', archivo!);
      if (proyectoId) datos.append('proyectoId', proyectoId);
      return api<{ id: string; advertencias: string[]; totalOrigen: string }>('/presupuestos/importar/neodata', { method: 'POST', body: datos });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['presupuestos'] });
      qc.invalidateQueries({ queryKey: ['proyectos'] });
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
      <select value={proyectoId} onChange={(e) => setProyectoId(e.target.value)}>
        <option value="">Proyecto nuevo con el nombre de la obra</option>
        {proyectos?.map((p) => (
          <option key={p.id} value={p.id}>
            Agregar a {p.nombre}
          </option>
        ))}
      </select>
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
