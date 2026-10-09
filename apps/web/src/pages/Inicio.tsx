import { useAuth } from '../lib/auth';

export function Inicio() {
  const { usuario } = useAuth();
  return (
    <section>
      <h2>Hola, {usuario?.nombre}</h2>
      <p className="tenue">Aquí aparecerán tus obras y presupuestos.</p>
    </section>
  );
}
