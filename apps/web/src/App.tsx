import { FolderOpen, History, LogOut, Users } from 'lucide-react';
import { NavLink, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { ROL_ETIQUETA } from './lib/api';
import { useAuth } from './lib/auth';
import { Bitacora } from './pages/Bitacora';
import { Login } from './pages/Login';
import { Arbol } from './pages/presupuesto/Arbol';
import { Insumos } from './pages/presupuesto/Insumos';
import { Matrices } from './pages/presupuesto/Matrices';
import { Matriz } from './pages/presupuesto/Matriz';
import { Presupuesto } from './pages/presupuesto/Presupuesto';
import { Presupuestos } from './pages/Presupuestos';
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
      <aside className="lateral">
        <div className="marca">
          <span className="logo">PU</span>
          PuSelfhost
        </div>
        <NavLink to="/presupuestos">
          <FolderOpen size={16} /> Presupuestos
        </NavLink>
        {usuario?.rol === 'admin' && (
          <>
            <NavLink to="/usuarios">
              <Users size={16} /> Usuarios
            </NavLink>
            <NavLink to="/bitacora">
              <History size={16} /> Bitácora
            </NavLink>
          </>
        )}
        <div className="usuario">
          <span>
            <strong>{usuario?.nombre}</strong>
            <br />
            <span className="tenue">{usuario && ROL_ETIQUETA[usuario.rol]}</span>
          </span>
          <button className="fantasma" onClick={logout}>
            <LogOut size={14} /> Salir
          </button>
        </div>
      </aside>
      <main className="contenido">
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
          <Route index element={<Navigate to="/presupuestos" replace />} />
          <Route path="presupuestos" element={<Presupuestos />} />
          <Route path="presupuestos/:id" element={<Presupuesto />}>
            <Route index element={<Arbol />} />
            <Route path="insumos" element={<Insumos />} />
            <Route path="matrices" element={<Matrices />} />
            <Route path="matrices/:mid" element={<Matriz />} />
          </Route>
          <Route element={<Protegido soloAdmin />}>
            <Route path="usuarios" element={<Usuarios />} />
            <Route path="bitacora" element={<Bitacora />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
