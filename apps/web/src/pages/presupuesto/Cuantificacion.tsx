import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlignLeft, Equal, FunctionSquare, Hash, MapPin, MoveHorizontal, MoveVertical, Plus, Square, Trash2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { cantidadTexto, Cuantificacion as DatosCuantificacion, mensajeError, RenglonCuantificacion } from '../../lib/presupuestos';
import { Th } from '../../components/tabla';
import { clavesPresupuesto } from './comun';

type Borrador = Record<'descripcion' | 'eje' | 'piezas' | 'largo' | 'ancho' | 'alto' | 'formula', string>;

const aBorrador = (r: RenglonCuantificacion): Borrador => ({
  descripcion: r.descripcion,
  eje: r.eje,
  piezas: cantidadTexto(r.piezas),
  largo: cantidadTexto(r.largo),
  ancho: cantidadTexto(r.ancho),
  alto: cantidadTexto(r.alto),
  formula: r.formula,
});
const vacio = (): Borrador => ({
  descripcion: '',
  eje: '',
  piezas: '',
  largo: '',
  ancho: '',
  alto: '',
  formula: '',
});
const nulo = (v: string) => (v.trim() === '' ? null : v.trim());

/**
 * Cuantificación (generador) de un concepto: cada renglón es un tramo medido. El resultado es
 * piezas × largo × ancho × alto (lo que se capture) o la fórmula, que puede usar P, L, A y H.
 * Al guardar, la suma pasa a ser la cantidad del concepto.
 */
export function Cuantificacion({
  presupuestoId,
  renglonId,
  editable,
  cerrar,
}: {
  presupuestoId: string;
  renglonId: string;
  editable: boolean;
  cerrar: () => void;
}) {
  const qc = useQueryClient();
  const clave = clavesPresupuesto.cuantificacion(presupuestoId, renglonId);
  const url = `/presupuestos/${presupuestoId}/renglones/${renglonId}/cuantificacion`;
  const { data, error } = useQuery({
    queryKey: clave,
    queryFn: () => api<DatosCuantificacion>(url),
  });
  const [borrador, setBorrador] = useState<Borrador[] | null>(null);
  const filas = borrador ?? data?.renglones.map(aBorrador) ?? [];

  const guardar = useMutation({
    mutationFn: () =>
      api<DatosCuantificacion>(url, {
        method: 'PUT',
        body: {
          renglones: filas.map((f) => ({
            ...f,
            piezas: nulo(f.piezas),
            largo: nulo(f.largo),
            ancho: nulo(f.ancho),
            alto: nulo(f.alto),
          })),
        },
      }),
    onSuccess: (nueva) => {
      qc.setQueryData(clave, nueva);
      setBorrador(null);
      qc.invalidateQueries({
        queryKey: clavesPresupuesto.detalle(presupuestoId),
      });
    },
  });

  if (error) return <p className="error">{mensajeError(error)}</p>;
  if (!data) return <p className="tenue pequeno">Cargando cuantificación…</p>;

  const sucio = borrador !== null;
  const editar = (i: number, campo: keyof Borrador, v: string) => setBorrador(filas.map((f, j) => (j === i ? { ...f, [campo]: v } : f)));
  const campo = (i: number, c: keyof Borrador, ancho: string, num = true) =>
    editable ? (
      <input className={`en-linea ${num ? 'num' : ''}`} style={{ width: ancho }} value={filas[i][c]} onChange={(e) => editar(i, c, e.target.value)} />
    ) : (
      filas[i][c]
    );

  return (
    <div className="cuantificacion">
      <div className="barra">
        <strong>Cuantificación de {data.clave}</strong>
        <span className="tenue pequeno">Resultado = piezas × largo × ancho × alto, o la fórmula (usa P, L, A, H). Los negativos descuentan.</span>
        <span className="espacio" />
        <button className="icono" onClick={cerrar} aria-label="Cerrar cuantificación">
          <X size={16} />
        </button>
      </div>
      <table className="tabla">
        <thead>
          <tr>
            <Th icono={<AlignLeft size={14} />}>Descripción</Th>
            <Th icono={<MapPin size={14} />}>Eje / tramo</Th>
            <Th icono={<Hash size={14} />} num>
              Piezas
            </Th>
            <Th icono={<MoveHorizontal size={14} />} num>
              Largo
            </Th>
            <Th icono={<Square size={14} />} num>
              Ancho
            </Th>
            <Th icono={<MoveVertical size={14} />} num>
              Alto
            </Th>
            <Th icono={<FunctionSquare size={14} />}>Fórmula</Th>
            <Th icono={<Equal size={14} />} num>
              Resultado
            </Th>
            {editable && <Th />}
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 && (
            <tr>
              <td colSpan={9} className="vacio">
                Sin cuantificación: la cantidad se captura a mano.
              </td>
            </tr>
          )}
          {filas.map((_, i) => (
            <tr key={i}>
              <td>{campo(i, 'descripcion', '14rem', false)}</td>
              <td>{campo(i, 'eje', '6rem', false)}</td>
              <td className="num">{campo(i, 'piezas', '4.5rem')}</td>
              <td className="num">{campo(i, 'largo', '5rem')}</td>
              <td className="num">{campo(i, 'ancho', '5rem')}</td>
              <td className="num">{campo(i, 'alto', '5rem')}</td>
              <td>{campo(i, 'formula', '9rem', false)}</td>
              <td className="num">{!sucio && cantidadTexto(data.renglones[i]?.resultado ?? null)}</td>
              {editable && (
                <td className="acciones">
                  <button className="peligro" onClick={() => setBorrador(filas.filter((__, j) => j !== i))} aria-label="Quitar renglón">
                    <Trash2 size={14} />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="partida">
            <td colSpan={7}>Total {data.unidad && `(${data.unidad})`}</td>
            <td className="num">{sucio ? '—' : cantidadTexto(data.total)}</td>
            {editable && <td />}
          </tr>
        </tfoot>
      </table>
      {editable && (
        <div className="barra">
          <button onClick={() => setBorrador([...filas, vacio()])}>
            <Plus size={16} /> Agregar renglón
          </button>
          <span className="espacio" />
          {sucio && (
            <button className="secundario" onClick={() => setBorrador(null)}>
              Descartar cambios
            </button>
          )}
          <button className="primario" disabled={!sucio || guardar.isPending} onClick={() => guardar.mutate()}>
            {guardar.isPending ? 'Guardando…' : 'Guardar y usar como cantidad'}
          </button>
        </div>
      )}
      {guardar.error && <p className="error">{mensajeError(guardar.error)}</p>}
    </div>
  );
}
