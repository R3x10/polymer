import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, Rol, ROL_ETIQUETA, Usuario } from '../lib/api';
import { useAuth } from '../lib/auth';
import { AtSign, CircleDot, Shield, User } from 'lucide-react';
import { Badge, Th } from '../components/tabla';

const ROLES = Object.keys(ROL_ETIQUETA) as Rol[];

export function Usuarios() {
  const { usuario: actual } = useAuth();
  const qc = useQueryClient();
  const { data: usuarios, isLoading } = useQuery({ queryKey: ['usuarios'], queryFn: () => api<Usuario[]>('/usuarios') });

  const actualizar = useMutation({
    mutationFn: ({ id, cambios }: { id: string; cambios: Partial<Usuario> }) => api<Usuario>(`/usuarios/${id}`, { method: 'PATCH', body: cambios }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['usuarios'] }),
  });

  return (
    <section>
      <div className="titulo-fila">
        <div>
          <h2>Usuarios</h2>
          <p className="tenue">Quién entra al sistema y qué puede hacer.</p>
        </div>
      </div>
      <NuevoUsuario />
      <div className="vista">
        <div className="tabla-contenedor">
          <table className="tabla">
            <thead>
              <tr>
                <Th icono={<User size={14} />}>Nombre</Th>
                <Th icono={<AtSign size={14} />}>Correo</Th>
                <Th icono={<Shield size={14} />}>Rol</Th>
                <Th icono={<CircleDot size={14} />}>Estado</Th>
                <Th>Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="vacio">
                    Cargando…
                  </td>
                </tr>
              ) : (
                usuarios?.map((u) => {
                  const soyYo = u.id === actual?.id;
                  return (
                    <tr key={u.id}>
                      <td>
                        <strong>{u.nombre}</strong>
                        {soyYo && <span className="tenue"> (tú)</span>}
                      </td>
                      <td>{u.email}</td>
                      <td>
                        <select value={u.rol} disabled={soyYo} onChange={(e) => actualizar.mutate({ id: u.id, cambios: { rol: e.target.value as Rol } })}>
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROL_ETIQUETA[r]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <Badge punto color={u.activo ? 'verde' : 'rojo'}>
                          {u.activo ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </td>
                      <td className="acciones">
                        {!soyYo && (
                          <button className={u.activo ? 'peligro' : undefined} onClick={() => actualizar.mutate({ id: u.id, cambios: { activo: !u.activo } })}>
                            {u.activo ? 'Desactivar' : 'Activar'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      {actualizar.error && <p className="error">{actualizar.error.message}</p>}
    </section>
  );
}

function NuevoUsuario() {
  const qc = useQueryClient();
  const vacio = { nombre: '', email: '', password: '', rol: 'presupuestador' as Rol };
  const [datos, setDatos] = useState(vacio);
  const crear = useMutation({
    mutationFn: () => api<Usuario>('/usuarios', { method: 'POST', body: datos }),
    onSuccess: () => {
      setDatos(vacio);
      qc.invalidateQueries({ queryKey: ['usuarios'] });
    },
  });

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    crear.mutate();
  };
  const err = crear.error instanceof ApiError ? crear.error : null;

  return (
    <form className="fila-form" onSubmit={enviar}>
      <input placeholder="Nombre" value={datos.nombre} onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} required />
      <input type="email" placeholder="Correo" value={datos.email} onChange={(e) => setDatos({ ...datos, email: e.target.value })} required />
      <input
        type="password"
        placeholder="Contraseña (mín. 8)"
        value={datos.password}
        onChange={(e) => setDatos({ ...datos, password: e.target.value })}
        minLength={8}
        required
      />
      <select value={datos.rol} onChange={(e) => setDatos({ ...datos, rol: e.target.value as Rol })}>
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROL_ETIQUETA[r]}
          </option>
        ))}
      </select>
      <button type="submit" className="primario" disabled={crear.isPending}>
        Agregar usuario
      </button>
      {err && <p className="error">{err.errores.length ? err.errores.map((e) => e.mensaje).join('. ') : err.message}</p>}
    </form>
  );
}
