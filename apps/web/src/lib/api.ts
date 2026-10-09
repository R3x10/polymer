export type Rol = 'admin' | 'presupuestador' | 'consulta';

export interface Usuario {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  activo?: boolean;
}

export const ROL_ETIQUETA: Record<Rol, string> = {
  admin: 'Administrador',
  presupuestador: 'Presupuestador',
  consulta: 'Solo consulta',
};

const TOKEN_KEY = 'puselfhost.token';

export const tokenGuardado = () => localStorage.getItem(TOKEN_KEY);
export const guardarToken = (t: string | null) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly errores: { campo: string; mensaje: string }[] = [],
  ) {
    super(message);
  }
}

/** Se dispara cuando el servidor rechaza la sesión, para regresar al inicio de sesión. */
export const SESION_VENCIDA = 'puselfhost:sesion-vencida';

export async function api<T>(ruta: string, opciones: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = tokenGuardado();
  const res = await fetch(`/api${ruta}`, {
    method: opciones.method ?? 'GET',
    headers: {
      ...(opciones.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opciones.body !== undefined ? JSON.stringify(opciones.body) : undefined,
  });
  const datos = res.status === 204 ? undefined : await res.json().catch(() => undefined);
  if (!res.ok) {
    if (res.status === 401 && token) window.dispatchEvent(new Event(SESION_VENCIDA));
    throw new ApiError(res.status, datos?.message ?? `Error ${res.status}`, datos?.errores);
  }
  return datos as T;
}
