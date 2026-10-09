import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { AuthProvider } from './lib/auth';

it('sin sesión muestra el inicio de sesión', async () => {
  localStorage.clear();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/usuarios']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  expect(screen.getByLabelText('Correo')).toBeInTheDocument();
});
