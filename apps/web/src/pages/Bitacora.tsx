import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, CircleDot, FileText, Route, User, Zap } from 'lucide-react';
import { api } from '../lib/api';
import { Badge, Busqueda, ColorBadge, Th, usePaginacion } from '../components/tabla';
import { coincide } from './presupuesto/comun';

interface Registro {
  id: string;
  fecha: string;
  usuario: string | null;
  metodo: string;
  ruta: string;
  estado: number;
  datos: Record<string, unknown> | null;
}

const ACCION: Record<string, { texto: string; color: ColorBadge }> = {
  POST: { texto: 'Creó', color: 'verde' },
  PUT: { texto: 'Reemplazó', color: 'azul' },
  PATCH: { texto: 'Modificó', color: 'amarillo' },
  DELETE: { texto: 'Eliminó', color: 'rojo' },
};

export function Bitacora() {
  const { data, isLoading } = useQuery({ queryKey: ['bitacora'], queryFn: () => api<Registro[]>('/bitacora?limite=2000') });
  const [busqueda, setBusqueda] = useState('');
  const filtrados = useMemo(() => (data ?? []).filter((r) => coincide(busqueda, r.usuario ?? '', r.ruta, JSON.stringify(r.datos ?? {}))), [data, busqueda]);
  const { visibles, control } = usePaginacion(filtrados, 25);

  return (
    <section>
      <div className="titulo-fila">
        <div>
          <h2>Bitácora</h2>
          <p className="tenue">Cada cambio queda registrado con quién lo hizo y cuándo. Las contraseñas no se guardan.</p>
        </div>
      </div>
      <div className="vista">
        <div className="herramientas">
          <span className="tenue pequeno">Últimos {filtrados.length.toLocaleString('es-MX')} movimientos</span>
          <span className="espacio" />
          <Busqueda valor={busqueda} cambiar={setBusqueda} placeholder="Usuario, ruta o dato" />
        </div>
        <div className="tabla-contenedor">
          <table className="tabla">
            <thead>
              <tr>
                <Th icono={<Calendar size={14} />}>Fecha</Th>
                <Th icono={<User size={14} />}>Usuario</Th>
                <Th icono={<Zap size={14} />}>Acción</Th>
                <Th icono={<Route size={14} />}>Ruta</Th>
                <Th icono={<FileText size={14} />}>Datos</Th>
                <Th icono={<CircleDot size={14} />}>Resultado</Th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="vacio">
                    Cargando…
                  </td>
                </tr>
              ) : (
                visibles.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap">{new Date(r.fecha).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'medium' })}</td>
                    <td>{r.usuario ?? <span className="tenue">Sin sesión</span>}</td>
                    <td>
                      <Badge color={ACCION[r.metodo]?.color ?? 'gris'}>{ACCION[r.metodo]?.texto ?? r.metodo}</Badge>
                    </td>
                    <td className="nowrap">{r.ruta.replace(/^\/api/, '')}</td>
                    <td className="descripcion" title={JSON.stringify(r.datos)}>
                      <code className="pequeno">{JSON.stringify(r.datos)}</code>
                    </td>
                    <td>
                      <Badge punto color={r.estado < 400 ? 'verde' : 'rojo'}>
                        {r.estado}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {control}
      </div>
    </section>
  );
}
