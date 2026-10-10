import { KeyboardEvent, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { DetallePresupuesto, Insumo, MatrizResumen } from '../../lib/presupuestos';

export const useIdPresupuesto = () => useParams<{ id: string }>().id!;

/** Puede modificar el presupuesto abierto: no es de solo consulta y el presupuesto no está congelado. */
export const usePuedeEditar = () => {
  const rol = useAuth().usuario?.rol;
  const estado = useDetalle(useIdPresupuesto()).data?.presupuesto.estado;
  return rol !== 'consulta' && estado !== 'congelado';
};

export const useEsEditor = () => useAuth().usuario?.rol !== 'consulta';

export const clavesPresupuesto = {
  detalle: (id: string) => ['presupuesto', id] as const,
  insumos: (id: string) => ['presupuesto', id, 'insumos'] as const,
  matrices: (id: string) => ['presupuesto', id, 'matrices'] as const,
  matriz: (id: string, mid: string) => ['presupuesto', id, 'matrices', mid] as const,
  cuantificacion: (id: string, rid: string) => ['presupuesto', id, 'cuantificacion', rid] as const,
};

export const useDetalle = (id: string) => useQuery({ queryKey: clavesPresupuesto.detalle(id), queryFn: () => api<DetallePresupuesto>(`/presupuestos/${id}`) });
export const useInsumos = (id: string) => useQuery({ queryKey: clavesPresupuesto.insumos(id), queryFn: () => api<Insumo[]>(`/presupuestos/${id}/insumos`) });
export const useMatrices = (id: string) =>
  useQuery({ queryKey: clavesPresupuesto.matrices(id), queryFn: () => api<MatrizResumen[]>(`/presupuestos/${id}/matrices`) });

/**
 * Campo que se edita en su lugar y guarda al salir o con Enter; Escape descarta.
 * Mientras no se toca, muestra el valor del servidor.
 */
export function CampoEditable({
  valor,
  guardar,
  deshabilitado,
  className,
  placeholder,
  ancho,
}: {
  valor: string;
  guardar: (v: string) => void;
  deshabilitado?: boolean;
  className?: string;
  placeholder?: string;
  ancho?: string;
}) {
  const [texto, setTexto] = useState(valor);
  useEffect(() => setTexto(valor), [valor]);
  const confirmar = () => {
    if (texto.trim() !== valor) guardar(texto.trim());
  };
  const tecla = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
    if (e.key === 'Escape') {
      setTexto(valor);
      e.currentTarget.blur();
    }
  };
  if (deshabilitado) return <span className={className}>{valor}</span>;
  return (
    <input
      className={`en-linea ${className ?? ''}`}
      style={ancho ? { width: ancho } : undefined}
      value={texto}
      placeholder={placeholder}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={tecla}
    />
  );
}

export const coincide = (busqueda: string, ...campos: string[]) => {
  const q = busqueda.trim().toLowerCase();
  return !q || campos.some((c) => c.toLowerCase().includes(q));
};
