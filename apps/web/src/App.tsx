import { NavLink, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { ROL_ETIQUETA } from './lib/api';
import { useAuth } from './lib/auth';
import { Inicio } from './pages/Inicio';
import { Login } from './pages/Login';
import { Usuarios } from './pages/Usuarios';

function Protegido({ soloAdmin = false }: { soloAdmin?: boolean }) {
  const { usuario, cargando } = useAuth();
  if (cargando) return <p className="tenue centro">Cargando…</p>;
  if (!usuario) return <Navigate to="/entrar" replace />;
  if (soloAdmin && usuario.rol !== 'admin') return <Navigate to="/" replace />;
  return <Outlet />;
}

function Marco() {
  const { usuario, logout } = useAuth();
  return (
    <div className="marco">
      <header>
        <strong>PuSelfhost</strong>
        <nav>
          <NavLink to="/" end>
            Inicio
          </NavLink>
          {usuario?.rol === 'admin' && <NavLink to="/usuarios">Usuarios</NavLink>}
        </nav>
        <span className="tenue">
          {usuario?.nombre} · {usuario && ROL_ETIQUETA[usuario.rol]}
        </span>
        <button className="secundario" onClick={logout}>
          Salir
        </button>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/entrar" element={<Login />} />
      <Route element={<Protegido />}>
        <Route element={<Marco />}>
          <Route index element={<Inicio />} />
          <Route element={<Protegido soloAdmin />}>
            <Route path="usuarios" element={<Usuarios />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
