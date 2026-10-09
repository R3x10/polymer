import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, guardarToken, SESION_VENCIDA, tokenGuardado, Usuario } from './api';

interface AuthCtx {
  usuario: Usuario | null;
  cargando: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(() => tokenGuardado() !== null);

  const logout = useCallback(() => {
    guardarToken(null);
    setUsuario(null);
  }, []);

  useEffect(() => {
    if (tokenGuardado()) {
      api<Usuario>('/auth/yo')
        .then(setUsuario)
        .catch(logout)
        .finally(() => setCargando(false));
    }
    window.addEventListener(SESION_VENCIDA, logout);
    return () => window.removeEventListener(SESION_VENCIDA, logout);
  }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api<{ token: string; usuario: Usuario }>('/auth/login', { method: 'POST', body: { email, password } });
    guardarToken(r.token);
    setUsuario(r.usuario);
  }, []);

  return <Ctx.Provider value={{ usuario, cargando, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
