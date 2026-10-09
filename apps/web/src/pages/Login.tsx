import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

export function Login() {
  const { usuario, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (usuario) return <Navigate to="/" replace />;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="login">
      <form className="tarjeta" onSubmit={enviar}>
        <h1>PuSelfhost</h1>
        <p className="tenue">Precios unitarios y presupuestos de obra</p>
        <label>
          Correo
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label>
          Contraseña
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
