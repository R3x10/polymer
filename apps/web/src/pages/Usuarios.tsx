import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, Rol, ROL_ETIQUETA, Usuario } from '../lib/api';
import { useAuth } from '../lib/auth';

const ROLES = Object.keys(ROL_ETIQUETA) as Rol[];

export function Usuarios() {
  const { usuario: actual } = useAuth();
  const qc = useQueryClient();
  const { data: usuarios, isLoading } = useQuery({ queryKey: ['usuarios'], queryFn: () => api<Usuario[]>('/usuarios') });

  const actualizar = useMutation({
    mutationFn: ({ id, cambios }: { id: string; cambios: Partial<Usuario> }) =>
      api<Usuario>(`/usuarios/${id}`, { method: 'PATCH', body: cambios }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['usuarios'] }),
  });

  return (
    <section>
      <h2>Usuarios</h2>
      <NuevoUsuario />
      {isLoading ? (
        <p className="tenue">Cargando…</p>
      ) : (
        <table className="tabla">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Correo</th>
              <th>Rol</th>
              <th>Activo</th>
            </tr>
          </thead>
          <tbody>
            {usuarios?.map((u) => {
              const soyYo = u.id === actual?.id;
              return (
                <tr key={u.id}>
                  <td>{u.nombre}</td>
                  <td>{u.email}</td>
                  <td>
                    <select
                      value={u.rol}
                      disabled={soyYo}
                      onChange={(e) => actualizar.mutate({ id: u.id, cambios: { rol: e.target.value as Rol } })}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROL_ETIQUETA[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={u.activo}
                      disabled={soyYo}
                      onChange={(e) => actualizar.mutate({ id: u.id, cambios: { activo: e.target.checked } })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
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
      <button type="submit" disabled={crear.isPending}>
        Agregar usuario
      </button>
      {err && <p className="error">{err.errores.length ? err.errores.map((e) => e.mensaje).join('. ') : err.message}</p>}
    </form>
  );
}
